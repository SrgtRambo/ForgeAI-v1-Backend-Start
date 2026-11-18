import { createFileRoute } from "@tanstack/react-router";
import { getSharedProject } from "@/lib/api";

export const Route = createFileRoute("/share/$token")({
  loader: async ({ params }) => {
    const project = await getSharedProject(params.token);
    return { project };
  },
  component: SharedProjectPage,
});

function SharedProjectPage() {
  const { project } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
        <p className="text-muted-foreground mb-6">Shared project · Last updated {new Date(project.updated_at).toLocaleString()}</p>
        <div className="rounded-lg border p-6">
          <pre className="text-sm overflow-auto max-h-[60vh]">{JSON.stringify(project.data, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
