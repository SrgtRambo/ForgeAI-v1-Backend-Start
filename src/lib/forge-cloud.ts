// Replit-native Forge Cloud bridge types.
// The actual bridge is instantiated in studio.tsx and backed by the backend API.
import type { ApiProject } from "@/lib/api";

export type SyncState = "saved" | "saving" | "error";

export interface ForgeCloudBridge {
  initialProjects: ApiProject[];
  sync: (projects: ApiProject[]) => void;
  flush: () => Promise<void>;
  hasPendingChanges: () => boolean;
  getAccessToken: () => Promise<string | null>;
}

declare global {
  interface Window {
    ForgeCloud?: ForgeCloudBridge | undefined;
  }
}
