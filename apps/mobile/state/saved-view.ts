/**
 * How the Saved tab lays the shortlist out (phase386, owner: "saved 重新设计
 * 一下 支持多种视图"). Kept on the device, so the tab reopens the way it was
 * left.
 *
 *   · towns — a shelf per town (phase272), the default
 *   · grid  — photographs, two across
 *   · list  — one compact row a save, with what its page found
 *   · map   — where the saves are, with a rail of them underneath
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SAVED_VIEWS = ["towns", "grid", "list", "map"] as const;
export type SavedView = (typeof SAVED_VIEWS)[number];

export const SAVED_VIEW_LABEL: Record<SavedView, string> = {
	towns: "Towns",
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
			view: "towns",
			setView: (view) => set({ view }),
		}),
		{
			name: "percho-v3:saved-view:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ view: s.view }),
		},
	),
);
