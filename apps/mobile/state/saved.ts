/**
 * Saved listings store — the card heart's target and the Saved tab's data.
 *
 * ── Scope: this is the local truth, nothing more ────────────────────────────
 *
 * Spec-v3's saved surface (05 §5.2) is not built: the Saved tab is a
 * placeholder, there is no `/api/mobile/saved` endpoint, and the server's
 * `listing_saves` table has no REST route. Until that lands, a persisted
 * local set is the only honest "saved" — it survives app restarts, it is the
 * exact data the Saved tab will render when task 5 wires it, and it costs no
 * fake network calls. The tab keeps its "task 5" copy; this store is what it
 * will read.
 *
 * Not persisted when empty (so a fresh install carries no empty-array
 * baggage); card ids only — the feed re-fetches fresh cards, so storing a
 * snapshot of `ListingCardV3` would go stale the moment a price changes.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SavedState {
	/** Listing card ids the buyer saved, most recent first. */
	ids: readonly string[];
	hydrated: boolean;
	/** Toggle a listing's saved state. Returns the new state. */
	toggle: (id: string) => boolean;
	isSaved: (id: string) => boolean;
}

export const useSavedStore = create<SavedState>()(
	persist(
		(set, get) => ({
			ids: [],
			hydrated: false,
			toggle: (id) => {
				const has = get().ids.includes(id);
				const ids = has
					? get().ids.filter((x) => x !== id)
					: [id, ...get().ids];
				set({ ids });
				return !has;
			},
			isSaved: (id) => get().ids.includes(id),
		}),
		{
			name: "percho-v3:saved:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => (s.ids.length === 0 ? {} : { ids: s.ids }),
			onRehydrateStorage: () => () => {
				useSavedStore.setState({ hydrated: true });
			},
		},
	),
);
