import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Help & Documentation</h1>
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-2">Getting Started</h2>
            <p className="text-muted-foreground">Describe your business in the Studio and Forge AI will generate professional websites, applications, spreadsheets, social media kits, and workflows.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-2">Projects</h2>
            <p className="text-muted-foreground">All your generated deliverables are saved as projects. You can search, filter, sort, share, duplicate, and delete projects from the Projects page.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-2">Sharing</h2>
            <p className="text-muted-foreground">Generate a shareable link for any project. Links can be revoked at any time. Public and unlisted visibility options are available.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-2">Versions</h2>
            <p className="text-muted-foreground">Every project maintains version history. You can save versions and restore previous ones at any time.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold mb-2">Downloads</h2>
            <p className="text-muted-foreground">Download your deliverables as ZIP files, XLSX workbooks, or other formats. All files are validated before delivery.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
