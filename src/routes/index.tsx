import { createFileRoute, redirect } from "@tanstack/react-router";

// Opening the app goes straight to the Forge AI workspace (sign-in first if needed).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge AI" },
      { name: "description", content: "Forge AI builds the custom software your business is missing." },
      { property: "og:title", content: "Forge AI" },
      { property: "og:description", content: "Forge AI builds the custom software your business is missing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/studio" });
  },
});
