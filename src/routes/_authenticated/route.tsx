import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ request, location }: any) => {
    const userId = request.headers.get("x-replit-user-id");
    const userName = request.headers.get("x-replit-user-name");

    if (!userId) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    return {
      user: {
        id: userId,
        email: request.headers.get("x-replit-user-email") ?? undefined,
        user_metadata: { user_name: userName ?? "" },
      },
    };
  },
  component: () => <Outlet />,
});
