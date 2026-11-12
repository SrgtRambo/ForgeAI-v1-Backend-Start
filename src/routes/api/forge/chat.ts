import { createFileRoute } from "@tanstack/react-router";

import { handleForgeChat, handleForgeStatus } from "@/lib/forge-ai.server";

export const Route = createFileRoute("/api/forge/chat")({
  server: {
    handlers: {
      GET: ({ request }) => handleForgeStatus(request),
      POST: ({ request }) => handleForgeChat(request),
    },
  },
});
