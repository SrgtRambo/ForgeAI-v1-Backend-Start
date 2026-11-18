import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ForgeLogo } from "@/components/forge-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/lib/auth-store";
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
  if (/invalid login credentials/i.test(message))
    return "That email and password don't match. Try again or reset your password.";
  if (/email not confirmed/i.test(message))
    return "Please confirm your email first — check your inbox for the link we sent.";
  if (/already registered|already exists/i.test(message))
    return "An account with this email already exists. Sign in instead.";
  if (/password/i.test(message) && /(weak|short|least)/i.test(message))
    return "Choose a stronger password with at least 8 characters.";
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  return message;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { session } = useAuthSession();
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
    if (session) void navigate({ to: destination, replace: true });
  }, [session, destination, navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success("Welcome back!");
        await navigate({ to: destination, replace: true });
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Choose a password with at least 8 characters.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/studio",
            data: { display_name: displayName.trim(), company_name: company.trim() },
          },
        });
        if (error) throw error;
        if (data.session) {
          await navigate({ to: "/studio", replace: true });
        } else {
          setSentTo({ kind: "confirm", email: email.trim() });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        setSentTo({ kind: "reset", email: email.trim() });
      }
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
          {sentTo ? (
            <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-glow backdrop-blur">
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {sentTo.kind === "confirm"
                  ? "We sent a confirmation link to "
                  : "If an account exists, we sent a password reset link to "}
                <span className="font-medium text-foreground">{sentTo.email}</span>.{" "}
                {sentTo.kind === "confirm"
                  ? "Open it to activate your account."
                  : "Open it to choose a new password."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Can't find it? Check your spam folder.
              </p>
              <Button
                variant="outline"
                className="mt-6 w-full"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/80 p-7 shadow-glow backdrop-blur">
              <h1 className="text-2xl font-bold">{copy.title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{copy.subtitle}</p>

              <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate={false}>
                {mode === "signup" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="displayName">Your name</Label>
                      <Input
                        id="displayName"
                        autoComplete="name"
                        required
                        maxLength={120}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Jordan Lee"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        autoComplete="organization"
                        maxLength={160}
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Summit Plumbing"
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => switchMode("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                    />
                  </div>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                <Button type="submit" variant="forge" size="xl" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : copy.cta}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    New to Forge AI?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode("signup")}
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode("signin")}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
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
