/**
 * Saved store — the card bookmark's target and the Saved tab's data.
 *
 * ── Scope: this is the local truth, nothing more ────────────────────────────
 *
 * There is still no `/api/mobile/saved` endpoint and no account to sync to, so
 * a persisted local list is the only honest "saved" — it survives app
 * restarts and costs no fake network calls. Kind-tagged ids only: the Saved
 * tab re-fetches fresh rows from the detail endpoints, so storing a snapshot
 * of a card would go stale the moment a price changes.
 *
 * ── v2 (phase116): entries carry their kind ─────────────────────────────────
 *
 * v1 stored bare listing ids. The Saved tab now shows Homes and Communities
 * (owner 2026-08-23: "saved is for both"), and a bare id cannot say which
 * detail endpoint resolves it. Persisted v1 arrays migrate as
 * `kind: "listing"` — the feed only ever routed listing saves into the store,
 * so that is what those ids are.
 *
 * Not persisted when empty (so a fresh install carries no empty-array
 * baggage).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
	/** Toggle an entry's saved state. Returns the new state. */
	toggle: (id: string, kind: SavedKind) => boolean;
	isSaved: (id: string) => boolean;
}

export const useSavedStore = create<SavedState>()(
	persist(
		(set, get) => ({
			items: [],
			hydrated: false,
			toggle: (id, kind) => {
				const has = get().items.some((x) => x.id === id);
				const items = has
					? get().items.filter((x) => x.id !== id)
					: [{ id, kind }, ...get().items];
				set({ items });
				return !has;
			},
			isSaved: (id) => get().items.some((x) => x.id === id),
		}),
		{
			name: "percho-v3:saved:v1",
			version: 2,
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => (s.items.length === 0 ? {} : { items: s.items }),
			migrate: (persisted) => {
				const old = persisted as { ids?: unknown };
				if (Array.isArray(old?.ids)) {
					return {
						items: old.ids
							.filter((id): id is string => typeof id === "string")
							.map((id) => ({ id, kind: "listing" as const })),
					};
				}
				return persisted as Partial<SavedState>;
			},
			onRehydrateStorage: () => () => {
				useSavedStore.setState({ hydrated: true });
			},
		},
	),
);
