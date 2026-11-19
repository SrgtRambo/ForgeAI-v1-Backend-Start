import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ForgeLogo } from "@/components/forge-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/safe-redirect";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; mode?: Mode } => {
    const out: { redirect?: string; mode?: Mode } = {};
    const redirect = search["redirect"];
    const mode = search["mode"];
    if (typeof redirect === "string") out.redirect = redirect;
    if (mode === "signup" || mode === "forgot") out.mode = mode;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Sign in — Forge AI" },
      {
        name: "description",
        content:
          "Sign in or create your Forge AI account to build custom software for your business.",
      },
      { property: "og:title", content: "Sign in — Forge AI" },
      {
        property: "og:description",
        content:
          "Sign in or create your Forge AI account to build custom software for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function friendlyError(message: string) {
  return message;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ kind: "confirm" | "reset"; email: string } | null>(null);
  const destination = safeRedirect(search.redirect);

  useEffect(() => {
    // Replit Auth handles sign-in at the proxy level. If the user reaches this page,
    // they should be redirected to Replit's sign-in flow automatically.
    // This page is a fallback for direct navigation.
  }, [destination, navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      toast.error("Sign-in is handled by Replit. Please use the Replit sign-in flow.");
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSentTo(null);
  }

  const titles: Record<Mode, { title: string; subtitle: string; cta: string }> = {
    signin: {
      title: "Welcome back",
      subtitle: "Sign in to pick up your projects where you left off.",
      cta: "Sign in",
    },
    signup: {
      title: "Create your account",
      subtitle: "Start forging software your company is missing.",
      cta: "Create account",
    },
    forgot: {
      title: "Reset your password",
      subtitle: "We'll email you a secure link to choose a new one.",
      cta: "Send reset link",
    },
  };
  const copy = titles[mode];

  return (
    <div className="relative min-h-screen bg-background bg-forge-glow">
      <div
        className="pointer-events-none absolute inset-0 grid-lines opacity-60"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
        <ForgeLogo />
        <main className="my-auto animate-rise py-10">
          <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-glow backdrop-blur">
            <h1 className="text-2xl font-bold">Sign in with Replit</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Forge AI uses Replit Auth for sign-in. You'll be redirected to Replit to
              authenticate, then sent back here automatically.
            </p>
            <div className="mt-8 text-sm text-muted-foreground">
              <p>If you're already signed in to Replit, you should be redirected to the studio automatically.</p>
              <p>If not, please sign in to Replit first, then return to this page.</p>
            </div>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => void navigate({ to: "/", replace: true })}
            >
              Go to homepage
            </Button>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Your projects are private to your account.{" "}
            <Link to="/" className="underline hover:text-foreground">
              Learn more
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
