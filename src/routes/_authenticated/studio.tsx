import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getCurrentUser,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  type ApiProject,
  type ApiUser,
} from "@/lib/api";

const FORGE_VERSION = "4";
const FORGE_SCRIPTS = ["architect.js", "ai-provider.js", "generator.js", "testing.js", "sample-projects.js", "app.js"];

type StudioLoaderData = {
  user: ApiUser;
  projects: ApiProject[];
};

export const Route = createFileRoute("/_authenticated/studio")({
  loader: async (): Promise<StudioLoaderData> => {
    const user = await getCurrentUser();
    const projects = await listProjects();
    return { user, projects };
  },
  component: StudioPage,
});

function loadScript(src: string) {
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset["forge"] = "true";
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error("Could not load " + src));
    document.body.appendChild(script);
  });
}

function StudioPage() {
  const { user } = Route.useRouteContext();
  const { user: profileUser, projects } = Route.useLoaderData() as StudioLoaderData;
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [sync, setSync] = useState<{ state: "saved" | "saving" | "error"; message?: string }>({ state: "saved" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    const added: HTMLElement[] = [];
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/forge/forge.css?v=${FORGE_VERSION}`;
    document.head.appendChild(link);
    added.push(link);

    (async () => {
      const markup = await fetch(`/forge/workspace.html?v=${FORGE_VERSION}`).then((r) => {
        if (!r.ok) throw new Error("Could not load the Forge workspace.");
        return r.text();
      });
      if (cancelled || !hostRef.current) return;
      hostRef.current.innerHTML = markup;

      // Minimal ForgeCloud bridge backed by the Replit backend API.
      const saved = new Map<string, string>();
      projects.forEach((p: ApiProject) => saved.set(p.id, JSON.stringify(p)));
      let pending: string | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = Promise.resolve();

      async function push(serialized: string) {
        const list = JSON.parse(serialized) as ApiProject[];
        const seen = new Set<string>();
        const upserts: Array<{ id: string; name: string; stage: string; data: Record<string, unknown> }> = [];
        for (const project of list) {
          if (!project || typeof project.id !== "string") continue;
          seen.add(project.id);
          const text = JSON.stringify(project);
          if (saved.get(project.id) === text) continue;
          upserts.push({
            id: project.id,
            name: String(project.name ?? "Untitled project").slice(0, 200),
            stage: String(project.stage ?? "").slice(0, 80),
            data: project.data ?? {},
          });
        }
        const removed = [...saved.keys()].filter((id) => !seen.has(id));
        for (const project of upserts) {
          try {
            await createProject(project);
            saved.set(project.id, JSON.stringify(project));
          } catch {
            await updateProject(project.id, {
              name: project.name,
              stage: project.stage,
              data: project.data,
            });
            saved.set(project.id, JSON.stringify(project));
          }
        }
        for (const id of removed) {
          try {
            await deleteProject(id);
            saved.delete(id);
          } catch {}
        }
        if (pending === null) setSync({ state: "saved" });
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
            if (pending === null) setSync({ state: "saved" });
          })
          .catch((error: unknown) => {
            console.error("[forge] save failed", error);
            if (pending === null) pending = next;
            setSync({ state: "error", message: error instanceof Error ? error.message : "Unknown error" });
          });
        return running;
      }

      window.ForgeCloud = {
        initialProjects: projects,
        sync(projs: ApiProject[]) {
          pending = JSON.stringify(projs);
          setSync({ state: "saving" });
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void flush(), 700);
        },
        flush,
        hasPendingChanges: () => pending !== null,
        getAccessToken: async () => null,
      };

      for (const file of FORGE_SCRIPTS) {
        if (cancelled) return;
        added.push(await loadScript(`/forge/${file}?v=${FORGE_VERSION}`));
      }
      if (cancelled) return;
      setSlot(document.getElementById("forgeAccountSlot"));
      setStatus("ready");
    })().catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    });

    const warn = (event: BeforeUnloadEvent) => {
      if (window.ForgeCloud?.hasPendingChanges()) {
        void window.ForgeCloud.flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", warn);
      void window.ForgeCloud?.flush();
      added.forEach((node) => node.remove());
      if (hostRef.current) hostRef.current.innerHTML = "";
      setSlot(null);
    };
  }, [user.id]);

  async function signOut() {
    await window.ForgeCloud?.flush();
    await queryClient.cancelQueries();
    queryClient.clear();
    window.ForgeCloud = undefined;
    await navigate({ to: "/auth", replace: true });
  }

  const name = profileUser?.name || profileUser?.email || "Your account";
  const syncLabel = sync.state === "saving" ? "SAVING…" : sync.state === "error" ? "NOT SAVED — RETRYING ON NEXT CHANGE" : "ALL CHANGES SAVED";

  return (
    <>
      {status === "loading" && (
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Opening your studio…
        </div>
      )}
      {status === "error" && (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <h1 className="text-xl font-semibold">Your studio didn't load</h1>
          <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
          <button className="text-sm text-primary underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}
      <div ref={hostRef} />
      {slot &&
        createPortal(
          <>
            <span className={`sync-state${sync.state === "error" ? " error" : ""}`} title={sync.message} role="status">
              {syncLabel}
            </span>
            <span className="account-name" title={profileUser?.email ?? undefined}>
              {name}
            </span>
            <a className="btn" href="/account" onClick={(e) => { e.preventDefault(); void navigate({ to: "/account" }); }}>
              Account
            </a>
            <button type="button" className="btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </>,
          slot,
        )}
    </>
  );
}
