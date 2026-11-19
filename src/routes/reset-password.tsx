import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ForgeLogo } from "@/components/forge-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Forge AI" },
      { name: "description", content: "Set a new password for your Forge AI account." },
      { property: "og:title", content: "Choose a new password — Forge AI" },
      { property: "og:description", content: "Set a new password for your Forge AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background bg-forge-glow">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
        <ForgeLogo />
        <main className="my-auto animate-rise rounded-2xl border border-border bg-card/80 p-7 shadow-glow">
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Password changes are handled by Replit Auth. Use your Replit account settings to update your password.
          </p>
          <div className="mt-6">
            <Button variant="outline" className="w-full" onClick={() => void navigate({ to: "/", replace: true })}>
              Go to homepage
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
