// In-process job runner. Webhooks only mark a purchase "queued"; the slow work happens here,
// after Stripe has already received its 200 response.
import { GenerationError, generateProject } from './engine.js';
import { buildZip } from './packager.js';

export function createJobRunner({ db, config, chat, log = console }) {
  const queue = [];
  const active = new Set();

  async function run(purchaseId) {
    // Atomic claim: only one worker can move a purchase from queued to processing.
    const { data: purchase, error } = await db
      .from('purchases')
      .update({ status: 'processing', progress: 1, progress_message: 'Starting', error: null })
      .eq('id', purchaseId)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!purchase) return;

    let lastWrite = 0;
    const onProgress = async (progress, message) => {
      const now = Date.now();
      if (now - lastWrite < 1500 && progress < 100) return;
      lastWrite = now;
      await db.from('purchases').update({ progress, progress_message: message }).eq('id', purchaseId);
    };

    try {
      const project = await generateProject({
        chat,
        model: config.models[purchase.tier] ?? config.models.standard,
        prompt: purchase.prompt,
        type: purchase.type,
        tier: purchase.tier,
        onProgress,
      });
      await onProgress(92, 'Packaging your files');
      const zip = await buildZip(project.name, project.files);
      const storagePath = `${purchase.user_id}/${purchase.id}.zip`;
      const { error: uploadError } = await db.storage
        .from(config.storageBucket)
        .upload(storagePath, zip, { contentType: 'application/zip', upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      await db
        .from('purchases')
        .update({
          status: 'ready',
          progress: 100,
          progress_message: 'Ready to download',
          storage_path: storagePath,
          file_count: Object.keys(project.files).length,
          project_name: project.name,
        })
        .eq('id', purchaseId);
      log.info?.(`[jobs] ${purchaseId} ready (${Object.keys(project.files).length} files)`);
    } catch (err) {
      log.error?.(`[jobs] ${purchaseId} failed:`, err);
      const message = err instanceof GenerationError
        ? `${err.message} Contact support for a free retry.`
        : 'Generation failed because of a server problem. Contact support for a free retry.';
      await db.from('purchases').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', purchaseId);
    }
  }

  function pump() {
    while (active.size < config.jobConcurrency && queue.length) {
      const id = queue.shift();
      const job = run(id)
        .catch((err) => log.error?.(`[jobs] ${id} crashed:`, err))
        .finally(() => {
          active.delete(job);
          pump();
        });
      active.add(job);
    }
  }

  return {
    enqueue(purchaseId) {
      if (!queue.includes(purchaseId)) queue.push(purchaseId);
      pump();
    },
    /** Re-queues work interrupted by a restart. Assumes a single server instance. */
    async recover() {
      await db.from('purchases').update({ status: 'queued' }).eq('status', 'processing');
      const { data } = await db.from('purchases').select('id').eq('status', 'queued').order('created_at');
      for (const row of data ?? []) this.enqueue(row.id);
      return data?.length ?? 0;
    },
    get size() {
      return queue.length + active.size;
    },
    async idle() {
      while (queue.length || active.size) await Promise.all([...active]);
    },
  };
}
