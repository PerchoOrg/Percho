/**
 * Saved store — the card bookmark's target and the Saved tab's data.
 *
 * ── v3 (phase B, store launch): the server is the truth ─────────────────────
 *
 * Saving now requires an account (owner 2026-09-04: accounts are in v1, and
 * saves sync across devices). Rows live in `saved_listings` /
 * `saved_communities` — the tables baseline 0016 built for exactly this
 * moment — written directly with the anon client under RLS
 * (`user_id = auth.uid()`). An authenticated save sets
 * `device_id = user_id`, so the existing (device_id, item_id) primary key
 * dedupes per USER: the same account on two phones cannot double-save.
 *
 * The local list stays, demoted to a write-through cache: it renders the
 * Saved tab instantly and keeps the tab honest offline. On sign-in it is
 * reconciled — pre-account local saves are pushed up ONCE (`migratedAt`
 * guards the push, otherwise a stale device cache would resurrect saves the
 * user deliberately removed elsewhere) — then replaced by the server list.
 * On sign-out it clears: another person signing in on this phone must not
 * inherit the list.
 *
 * `kind: "area"` never reaches the server — no table for it, and the feed
 * cannot currently produce an area save at all (no `geo` slot in STAGE_MIX).
 * Area entries stay device-local, exactly as before.
 *
 * ── v2 (phase116): entries carry their kind ─────────────────────────────────
 *
 * v1 stored bare listing ids. Persisted v1 arrays migrate as
 * `kind: "listing"` — the feed only ever routed listing saves into the store,
 * so that is what those ids are.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "./auth";

/** What a saved id points at — which detail surface can resolve it. */
export type SavedKind = "listing" | "community" | "area";

export interface SavedItem {
	id: string;
	kind: SavedKind;
}

interface SavedState {
	/** Saved entries, most recent first. */
	items: readonly SavedItem[];
	hydrated: boolean;
	/** ISO timestamp of the one-time local→server push. Null = not yet run. */
	migratedAt: string | null;
	/**
	 * Toggle an entry's saved state. Returns the new state. Signed out, a
	 * server kind routes to the sign-in screen instead of toggling — the gate
	 * lives HERE so every bookmark in the app (five call sites and counting)
	 * gets it without repeating itself.
	 */
	toggle: (id: string, kind: SavedKind) => boolean;
	isSaved: (id: string) => boolean;
}

const TABLE: Record<
	Exclude<SavedKind, "area">,
	{ table: string; column: string }
> = {
	listing: { table: "saved_listings", column: "listing_id" },
	community: { table: "saved_communities", column: "community_id" },
};

/** Insert one save. Duplicate (23505) is success: the row is there. */
async function pushSave(uid: string, item: SavedItem): Promise<void> {
	if (item.kind === "area") return;
	const { table, column } = TABLE[item.kind];
	const { error } = await supabase()
		.from(table)
		.insert({ device_id: uid, user_id: uid, [column]: item.id });
	if (error && error.code !== "23505") throw new Error(error.message);
}

async function pushRemove(uid: string, item: SavedItem): Promise<void> {
	if (item.kind === "area") return;
	const { table, column } = TABLE[item.kind];
	const { error } = await supabase()
		.from(table)
		.delete()
		.eq("user_id", uid)
		.eq(column, item.id);
	if (error) throw new Error(error.message);
}

async function fetchServerItems(uid: string): Promise<SavedItem[]> {
	const rows: Array<SavedItem & { created_at: string }> = [];
	for (const kind of ["listing", "community"] as const) {
		const { table, column } = TABLE[kind];
		// `select("*")` over an interpolated column list: the untyped client's
		// template-literal parser rejects dynamic strings at compile time.
		const { data, error } = await supabase()
			.from(table)
			.select("*")
			.eq("user_id", uid);
		if (error) throw new Error(error.message);
		for (const row of (data ?? []) as Array<Record<string, string>>) {
			const id = row[column];
			const created_at = row.created_at;
			if (id && created_at) rows.push({ id, kind, created_at });
		}
	}
	rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	return rows.map(({ id, kind }) => ({ id, kind }));
}

export const useSavedStore = create<SavedState>()(
	persist(
		(set, get) => ({
			items: [],
			hydrated: false,
			migratedAt: null,
			toggle: (id, kind) => {
				const before = get().items;
				const has = before.some((x) => x.id === id);
				const uid = useAuthStore.getState().session?.user.id;
				// Signed out, a server-backed save would exist nowhere but this
				// device and silently diverge — send the user to sign in instead.
				if (!uid && kind !== "area") {
					router.push("/auth");
					return has;
				}

				const items = has
					? before.filter((x) => x.id !== id)
					: [{ id, kind }, ...before];
				set({ items });

				if (uid && kind !== "area") {
					const op = has
						? pushRemove(uid, { id, kind })
						: pushSave(uid, { id, kind });
					op.catch(() => {
						// Server said no — the optimistic flip was wrong; put it back.
						set({ items: before });
					});
				}
				return !has;
			},
			isSaved: (id) => get().items.some((x) => x.id === id),
		}),
		{
			name: "percho-v3:saved:v1",
			version: 3,
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) =>
				s.items.length === 0 && s.migratedAt === null
					? {}
					: { items: s.items, migratedAt: s.migratedAt },
			migrate: (persisted) => {
				const old = persisted as { ids?: unknown };
				if (Array.isArray(old?.ids)) {
					return {
						items: old.ids
							.filter((id): id is string => typeof id === "string")
							.map((id) => ({ id, kind: "listing" as const })),
					};
				}
				// v2 → v3 adds fields with defaults; the shape passes through.
				return persisted as Partial<SavedState>;
			},
			onRehydrateStorage: () => () => {
				useSavedStore.setState({ hydrated: true });
			},
		},
	),
);

/** Resolves once the persisted state is back from AsyncStorage. */
function savedHydrated(): Promise<void> {
	if (useSavedStore.getState().hydrated) return Promise.resolve();
	return new Promise((resolve) => {
		const unsub = useSavedStore.subscribe((s) => {
			if (s.hydrated) {
				unsub();
				resolve();
			}
		});
	});
}

/**
 * Reconcile with the server for a freshly signed-in user. Exported for tests;
 * fired by the auth subscription below. A network failure leaves the local
 * cache in place — the next sign-in state change retries.
 *
 * Waits for rehydration first: on a signed-in cold start the session can win
 * the race against AsyncStorage, and syncing over a not-yet-hydrated store
 * would both skip the one-time migration (items still []) and let the late
 * rehydrate stomp the fresh server list.
 */
export async function syncSaved(uid: string): Promise<void> {
	await savedHydrated();
	const { items, migratedAt } = useSavedStore.getState();

	if (migratedAt === null) {
		for (const item of items) {
			if (item.kind === "area") continue;
			await pushSave(uid, item).catch(() => {
				// One failed push must not strand the rest; the row is also
				// recoverable — the item is still in the local list.
			});
		}
		useSavedStore.setState({ migratedAt: new Date().toISOString() });
	}

	try {
		const server = await fetchServerItems(uid);
		const areas = useSavedStore
			.getState()
			.items.filter((x) => x.kind === "area");
		useSavedStore.setState({ items: [...server, ...areas] });
	} catch {
		// Offline sync failure: keep showing the cache.
	}
}

let lastUid: string | null = null;
useAuthStore.subscribe((state) => {
	const uid = state.session?.user.id ?? null;
	if (uid === lastUid) return;
	lastUid = uid;
	if (uid) {
		void syncSaved(uid);
	} else if (state.hydrated) {
		// Sign-out (not cold start): the list belongs to the account, not the
		// device. Keep `migratedAt` — the one-time push already happened.
		useSavedStore.setState({ items: [] });
	}
});
