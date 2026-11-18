import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/landing/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Forge AI" },
      { name: "description", content: "What information Forge AI keeps about you and your projects, and why." },
      { property: "og:title", content: "Privacy — Forge AI" },
      { property: "og:description", content: "What information Forge AI keeps about you and your projects, and why." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="November 2026">
      <p>
        This page explains in plain language what Forge AI stores. It is a starting summary, not
        legal advice.
      </p>
      <h2>What we keep</h2>
      <p>
        Your account email, the name and company on your profile, the projects you create in the
        Studio, and a count of AI requests so we can apply daily limits.
      </p>
      <h2>How it is used</h2>
      <p>
        Only to run your account and generate your sites. Each project is visible to its owner
        only. We do not sell your information.
      </p>
      <h2>Your choices</h2>
      <p>You can edit your profile or delete your projects at any time from your account.</p>
    </LegalPage>
  );
}
