import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ForgeLogo } from "@/components/forge-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, updateUser, type ApiUser } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/account")({
  loader: async (): Promise<{ user: ApiUser }> => {
    const user = await getCurrentUser();
    return { user };
  },
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const { user: profile } = Route.useLoaderData() as { user: ApiUser };
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.name ?? "");
  const [company, setCompany] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const updates: { name?: string } = {};
      const trimmed = displayName.trim().slice(0, 120);
      if (trimmed.length > 0) updates.name = trimmed;
      const updated = await updateUser(updates);
      return updated;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      setDisplayName(updated.name ?? "");
      toast.success("Profile saved");
    },
    onError: (error) => toast.error("Couldn't save your profile: " + error.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await navigate({ to: "/auth", replace: true });
  }

  function onProfile(event: FormEvent) {
    event.preventDefault();
    saveProfile.mutate();
  }

  return (
    <div className="min-h-screen bg-background bg-forge-glow">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <ForgeLogo />
        <Button asChild variant="forge" size="sm">
          <Link to="/studio">Back to studio</Link>
        </Button>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-5 pb-16">
        <div className="animate-rise">
          <h1 className="text-3xl font-bold">Your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email ?? profile?.email ?? "your account"}</p>
        </div>

        <section className="rounded-2xl border border-border bg-card/80 p-6">
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in your studio. Only you can see it.
          </p>
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={onProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Your name</Label>
              <Input
                id="displayName"
                maxLength={120}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jordan Lee"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="forge" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card/80 p-6">
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Password changes are handled by Replit Auth. Use your Replit account settings to update your password.
          </p>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-6">
          <div>
            <h2 className="text-lg font-semibold">Sign out</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your projects stay saved to your account.
            </p>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </section>
      </main>
    </div>
  );
}
