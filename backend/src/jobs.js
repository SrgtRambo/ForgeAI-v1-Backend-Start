// In-process job runner for Forge AI.
// Two job types: generation (full AI pipeline) and rebuild (image slots only).
// Generation jobs use the AI model; rebuild jobs only resolve images, buildSite, and QA.
import { GenerationError, generateProject } from "./engine.js";
import { buildZip } from "./packager.js";
import { buildSite } from "./site/build.js";
import { runQA } from "./qa/index.js";
import { resolveAndDownload } from "./images/resolve.js";
import { createUnsplashProvider } from "./images/unsplash.js";
import { createPexelsProvider } from "./images/pexels.js";
import { put as storagePut, get as storageGet } from "./infra/storage.js";

export function createJobRunner({ db, config, chat, log = console }) {
  const queue = [];
  const active = new Set();
  const rebuildQueue = [];
  const rebuildActive = new Set();

  async function run(purchaseId) {
    const rows = await db.query(
      `update purchases
       set status = 'processing', progress = 1, progress_message = 'Starting', error = null
       where id = $1 and status = 'queued'
       returning *`,
      [purchaseId],
    );
    const purchase = rows[0];
    if (!purchase) return;

    let lastWrite = 0;
    const onProgress = async (progress, message) => {
      const now = Date.now();
      if (now - lastWrite < 1500 && progress < 100) return;
      lastWrite = now;
      await db.query(
        `update purchases set progress = $1, progress_message = $2 where id = $3`,
        [progress, message, purchaseId],
      );
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
      await onProgress(92, "Packaging your files");
      const zip = await buildZip(project.name, project.files);
      const storagePath = `${purchase.user_id}/${purchase.id}.zip`;
      await storagePut(storagePath, zip, "application/zip");
      await db.query(
        `update purchases
         set status = 'ready', progress = 100, progress_message = 'Ready to download',
             storage_path = $1, file_count = $2, project_name = $3
         where id = $4`,
        [storagePath, Object.keys(project.files).length, project.name, purchaseId],
      );
      log.info?.(`[jobs] ${purchaseId} ready (${Object.keys(project.files).length} files)`);
    } catch (err) {
      log.error?.(`[jobs] ${purchaseId} failed:`, err);
      const message =
        err instanceof GenerationError
          ? `${err.message} Contact support for a free retry.`
          : "Generation failed because of a server problem. Contact support for a free retry.";
      await db.query(
        `update purchases set status = 'failed', error = $1 where id = $2`,
        [message.slice(0, 500), purchaseId],
      );
    }
  }

  async function runRebuild(briefId) {
    try {
      const rows = await db.query(`select * from site_briefs where id = $1`, [briefId]);
      const brief = rows[0];
      if (!brief) {
        log.error?.(`[rebuild] brief ${briefId} not found`);
        return;
      }

      const spec = brief.spec;
      const images = [];

      const assetRows = await db.query(
        `select slot_id, source, storage_key, credit from site_image_assets where brief_id = $1`,
        [briefId],
      );

      const unsplash = createUnsplashProvider({ accessKey: process.env.UNSPLASH_ACCESS_KEY });
      const pexels = createPexelsProvider({ accessKey: process.env.PEXELS_API_KEY });

      for (const asset of assetRows) {
        if (asset.source === "stock") {
          const slot = spec.images?.find((i) => i.id === asset.slot_id);
          if (slot) {
            const result = await resolveAndDownload({
              slot,
              destPath: `/tmp/${briefId}-${asset.slot_id}.jpg`,
              unsplash,
              pexels,
            });
            if (result.filePath) {
              images.push({
                id: asset.slot_id,
                slot: asset.slot_id,
                source: "stock",
                filePath: result.filePath,
                credit: result.credit,
              });
            }
          }
        } else if (asset.source === "upload" || asset.source === "url") {
          const obj = await storageGet(asset.storage_key);
          if (obj) {
            images.push({
              id: asset.slot_id,
              slot: asset.slot_id,
              source: asset.source,
              filePath: `assets/images/${asset.slot_id}.jpg`,
              credit: asset.credit || {},
              _buffer: obj.buffer,
            });
          }
        }
      }

      const { files } = await buildSite(spec, images, { baseUrl: config.baseUrl });

      const qaResult = await runQA({ files, chat, model: config.models.standard });
      const qaReportKey = `briefs/${briefId}/qa-report.json`;
      await storagePut(qaReportKey, Buffer.from(JSON.stringify(qaResult.report, null, 2)), "application/json");

      const purchaseRows = await db.query(
        `select id from purchases where brief_id = $1 order by created_at desc limit 1`,
        [briefId],
      );
      if (purchaseRows[0]) {
        await db.query(
          `update purchases set qa_status = $1, qa_report_key = $2 where id = $3`,
          [qaResult.qaStatus, qaReportKey, purchaseRows[0].id],
        );
      }

      log.info?.(`[rebuild] brief ${briefId} QA status: ${qaResult.qaStatus}`);
    } catch (err) {
      log.error?.(`[rebuild] brief ${briefId} failed:`, err);
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

  function pumpRebuild() {
    while (rebuildActive.size < config.jobConcurrency && rebuildQueue.length) {
      const id = rebuildQueue.shift();
      const job = runRebuild(id)
        .catch((err) => log.error?.(`[rebuild] ${id} crashed:`, err))
        .finally(() => {
          rebuildActive.delete(job);
          pumpRebuild();
        });
      rebuildActive.add(job);
    }
  }

  return {
    enqueue(purchaseId) {
      if (!queue.includes(purchaseId)) queue.push(purchaseId);
      pump();
    },
    enqueueRebuild(briefId) {
      const idx = rebuildQueue.indexOf(briefId);
      if (idx >= 0) rebuildQueue.splice(idx, 1);
      if (rebuildActive.has(briefId)) return;
      rebuildQueue.push(briefId);
      pumpRebuild();
    },
    async recover() {
      await db.query(`update purchases set status = 'queued' where status = 'processing'`);
      const rows = await db.query(
        `select id from purchases where status = 'queued' order by created_at`,
      );
      for (const row of rows) this.enqueue(row.id);
      return rows.length;
    },
    get size() {
      return queue.length + active.size;
    },
    async idle() {
      while (queue.length || active.size) await Promise.all([...active]);
      while (rebuildQueue.length || rebuildActive.size) await Promise.all([...rebuildActive]);
    },
  };
}
