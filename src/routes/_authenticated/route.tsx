import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
