/**
 * How the Saved tab lays the shortlist out (phase386, owner: "saved 重新设计
 * 一下 支持多种视图"). Kept on the device, so the tab reopens the way it was
 * left.
 *
 *   · grid  — photographs, two across, the default (phase404.25)
 *   · list  — one compact row a save, with what its page found
 *   · towns — a shelf per city (phase272), labelled "City"
 *   · map   — where the saves are, with a rail of them underneath
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SAVED_VIEWS = ["grid", "list", "towns", "map"] as const;
export type SavedView = (typeof SAVED_VIEWS)[number];

export const SAVED_VIEW_LABEL: Record<SavedView, string> = {
	towns: "City",
	grid: "Grid",
	list: "List",
	map: "Map",
};

interface SavedViewState {
	view: SavedView;
	setView: (view: SavedView) => void;
}

export const useSavedViewStore = create<SavedViewState>()(
	persist(
		(set) => ({
			view: "grid",
			setView: (view) => set({ view }),
		}),
		{
			// v2 (phase404.25): Grid became the default, and everyone starts on
			// it once rather than keeping the City view v1 defaulted them to.
			name: "percho-v3:saved-view:v2",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ view: s.view }),
		},
	),
);
