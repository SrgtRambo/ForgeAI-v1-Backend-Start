// Bridges the Forge workspace scripts to the signed-in user's private project storage.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type ForgeProject = { id: string; name?: string; stage?: string; [key: string]: unknown };
export type SyncState = "saved" | "saving" | "error";

export interface ForgeCloudBridge {
  initialProjects: ForgeProject[];
  sync: (projects: ForgeProject[]) => void;
  flush: () => Promise<void>;
  hasPendingChanges: () => boolean;
  getAccessToken: () => Promise<string | null>;
}

declare global {
  interface Window {
    ForgeCloud?: ForgeCloudBridge | undefined;
  }
}

export async function loadForgeProjects(): Promise<ForgeProject[]> {
  const { data, error } = await supabase
    .from("forge_projects")
    .select("data")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as unknown as ForgeProject);
}

export function createForgeCloud(
  userId: string,
  initialProjects: ForgeProject[],
  onState: (state: SyncState, message?: string) => void,
): ForgeCloudBridge {
  const saved = new Map<string, string>();
  initialProjects.forEach((project) => saved.set(project.id, JSON.stringify(project)));
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  async function push(serialized: string) {
    const list = JSON.parse(serialized) as ForgeProject[];
    const seen = new Set<string>();
    const upserts = [];
    for (const project of list) {
      if (!project || typeof project.id !== "string") continue;
      seen.add(project.id);
      const text = JSON.stringify(project);
      if (saved.get(project.id) === text) continue;
      upserts.push({
        user_id: userId,
        project_id: project.id,
        name: String(project.name ?? "Untitled project").slice(0, 200),
        stage: String(project.stage ?? "").slice(0, 80),
        data: project as unknown as Json,
      });
    }
    const removed = [...saved.keys()].filter((id) => !seen.has(id));
    for (const row of upserts) {
      const { error } = await supabase
        .from("forge_projects")
        .upsert(row, { onConflict: "user_id,project_id" });
      if (error) throw error;
      saved.set(row.project_id, JSON.stringify(row.data));
    }
    if (removed.length) {
      const { error } = await supabase.from("forge_projects").delete().in("project_id", removed);
      if (error) throw error;
      removed.forEach((id) => saved.delete(id));
    }
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const next = pending;
    pending = null;
    if (next === null) return running;
    running = running
      .then(() => push(next))
      .then(() => {
        if (pending === null) onState("saved");
      })
      .catch((error: unknown) => {
        console.error("[forge] save failed", error);
        if (pending === null) pending = next;
        onState("error", error instanceof Error ? error.message : "Unknown error");
      });
    return running;
  }

  return {
    initialProjects,
    sync(projects) {
      pending = JSON.stringify(projects);
      onState("saving");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 700);
    },
    flush,
    hasPendingChanges: () => pending !== null,
    async getAccessToken() {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}
