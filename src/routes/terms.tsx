import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — Forge AI" },
      { name: "description", content: "The basic terms for using Forge AI to generate websites and software." },
      { property: "og:title", content: "Terms — Forge AI" },
      { property: "og:description", content: "The basic terms for using Forge AI to generate websites and software." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 2026">
      <p>
        These are the basic terms for using Forge AI. They are a starting summary, not legal
        advice.
      </p>
      <h2>Your content</h2>
      <p>
        You own the sites and files Forge AI generates for you and may host or edit them anywhere.
      </p>
      <h2>Fair use</h2>
      <p>
        Free accounts have daily limits. Don't use Forge AI to create unlawful, harmful or
        misleading content.
      </p>
      <h2>No guarantees</h2>
      <p>
        Generated sites are checked automatically, but please review them before publishing.
      </p>
    </LegalPage>
  );
}
