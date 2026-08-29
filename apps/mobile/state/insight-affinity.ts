import type { InsightTheme } from "@percho/shared/insights";
/**
 * Insight affinity — which "After you move in" THEMES this buyer lingers on.
 *
 * A count per theme, bumped when the buyer swipes a card into focus (not the
 * first card, which is focused for them), read by `rankInsights` to tilt the
 * next listing's rail. Local and persisted, like `saved` — there is no
 * account to sync to.
 *
 * §9.7 silent learning: nothing here is ever shown to the buyer. Its only
 * echo is ordering.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface InsightAffinityState {
	focus: Readonly<Partial<Record<InsightTheme, number>>>;
	bump: (theme: InsightTheme) => void;
}

export const useInsightAffinity = create<InsightAffinityState>()(
	persist(
		(set, get) => ({
			focus: {},
			bump: (theme) =>
				set({
					focus: { ...get().focus, [theme]: (get().focus[theme] ?? 0) + 1 },
				}),
		}),
		{
			name: "percho-v3:insight-affinity:v1",
			version: 1,
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) =>
				Object.keys(s.focus).length === 0 ? {} : { focus: s.focus },
		},
	),
);
