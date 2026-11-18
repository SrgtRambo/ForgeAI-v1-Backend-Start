// Single source of truth for the browser session. The root route owns the only
// session state and pushes changes here.
// Replit-native: no Supabase dependency.
import { useSyncExternalStore } from "react";

type AuthSnapshot = { session: { user: { id: string; email?: string } } | null; ready: boolean };

let snapshot: AuthSnapshot = { session: null, ready: false };
const listeners = new Set<() => void>();

export function setAuthSession(session: { user: { id: string; email?: string } } | null) {
  snapshot = { session, ready: true };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: AuthSnapshot = { session: null, ready: false };

export function useAuthSession() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}
