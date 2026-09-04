/**
 * Auth session mirror — the ONE place the app reads "who is signed in".
 *
 * supabase-js already persists and refreshes the session in AsyncStorage
 * (`lib/supabase.ts`); duplicating tokens into another persisted store would
 * create two sources of truth that drift. So this store is NOT persisted —
 * it is a live mirror of the client's session, filled by `initAuth()` once at
 * app start and kept current by `onAuthStateChange`.
 *
 * `hydrated` is false until the initial `getSession()` read returns, so
 * screens can tell "signed out" apart from "not yet known" (same pattern as
 * every persisted store here).
 */
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface AuthState {
	session: Session | null;
	hydrated: boolean;
}

export const useAuthStore = create<AuthState>(() => ({
	session: null,
	hydrated: false,
}));

let started = false;

/**
 * Idempotent; called from the root layout. Split from the store definition so
 * importing `useAuthStore` (e.g. in tests) never touches the network.
 */
export function initAuth(): void {
	if (started) return;
	started = true;
	supabase()
		.auth.getSession()
		.then(({ data }) => {
			useAuthStore.setState({ session: data.session, hydrated: true });
		})
		.catch(() => {
			// A failed read means "no usable session", not "crash the app".
			useAuthStore.setState({ session: null, hydrated: true });
		});
	supabase().auth.onAuthStateChange((_event, session) => {
		useAuthStore.setState({ session, hydrated: true });
	});
}
