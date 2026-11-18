import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LandingFooter } from "./landing-bottom";
import { LandingNav } from "./landing-nav";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="landing min-h-screen">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-5 py-20">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-10 space-y-6 text-base leading-relaxed text-muted-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
