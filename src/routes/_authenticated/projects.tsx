import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { listProjects, deleteProject, shareProject, revokeShare, saveVersion, listVersions, restoreVersion, type ApiProject } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/projects")({
  loader: async () => {
    const projects = await listProjects();
    return { projects };
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  const { projects: initial } = Route.useLoaderData();
  const [projects, setProjects] = useState<ApiProject[]>(initial);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "private" | "shared">("all");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const navigate = useNavigate();

  const filtered = projects
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "shared" && (!p.share_token || p.visibility === "private")) return false;
      if (filter === "private" && p.visibility && p.visibility !== "private") return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleShare(id: string) {
    const result = await shareProject(id, "unlisted");
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, share_token: result.shareUrl.split("/").pop()!, visibility: "unlisted" } : p)));
    await navigator.clipboard.writeText(window.location.origin + result.shareUrl);
    alert("Share link copied to clipboard.");
  }

  async function handleRevoke(id: string) {
    await revokeShare(id);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, share_token: null, visibility: "private" } : p)));
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Projects</h1>
          <button onClick={() => navigate({ to: "/studio" })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
            Open Studio
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm flex-1 min-w-[200px]"
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-3 py-2 border rounded-md text-sm">
            <option value="all">All</option>
            <option value="private">Private</option>
            <option value="shared">Shared</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="px-3 py-2 border rounded-md text-sm">
            <option value="updated">Last updated</option>
            <option value="name">Name</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">No projects found</p>
            <p className="text-sm">Create your first project in the Studio.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <div key={p.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  {p.visibility && p.visibility !== "private" && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Shared</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">Stage: {p.stage || "—"}</p>
                <p className="text-xs text-muted-foreground mb-3">Updated {new Date(p.updated_at).toLocaleDateString()}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => navigate({ to: "/studio" })} className="text-xs px-2 py-1 border rounded hover:bg-muted">Open</button>
                  {p.share_token ? (
                    <button onClick={() => handleRevoke(p.id)} className="text-xs px-2 py-1 border rounded hover:bg-muted">Revoke link</button>
                  ) : (
                    <button onClick={() => handleShare(p.id)} className="text-xs px-2 py-1 border rounded hover:bg-muted">Share</button>
                  )}
                  <button onClick={() => handleDelete(p.id)} className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
