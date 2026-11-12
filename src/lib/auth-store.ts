// Single source of truth for the browser session. The root route owns the only
// onAuthStateChange subscription and pushes changes here.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";

type AuthSnapshot = { session: Session | null; ready: boolean };

let snapshot: AuthSnapshot = { session: null, ready: false };
const listeners = new Set<() => void>();

export function setAuthSession(session: Session | null) {
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
