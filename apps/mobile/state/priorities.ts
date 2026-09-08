/**
 * The buyer's DECLARED priorities. Rules and rationale live in
 * `lib/priorities.ts`; this is only the persistence.
 *
 * Device-local, like `signals` and `sound`. Nothing here is written to the
 * server: it is a statement about how someone wants to be shown things, not
 * an account fact, and syncing it would mean a signed-out buyer's answers
 * silently changed when they signed in.
 *
 * AsyncStorage rehydrates asynchronously, so the first render sees the neutral
 * default regardless of what is on disk. `hydrated` lets a caller wait before
 * treating a weight as the buyer's own answer rather than as our default.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	MAX_WEIGHT,
	type PriorityKey,
	type PriorityWeights,
	defaultWeights,
	normalizeWeights,
} from "../lib/priorities";

interface PriorityState {
	weights: PriorityWeights;
	hydrated: boolean;
	setWeight: (key: PriorityKey, weight: number) => void;
	reset: () => void;
}

export const usePriorityStore = create<PriorityState>()(
	persist(
		(set) => ({
			weights: defaultWeights(),
			hydrated: false,
			setWeight: (key, weight) =>
				set((s) => ({
					weights: {
						...s.weights,
						[key]: Math.max(0, Math.min(MAX_WEIGHT, Math.round(weight))),
					},
				})),
			reset: () => set({ weights: defaultWeights() }),
		}),
		{
			name: "percho-v3:priorities:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ weights: s.weights }),
			// A build that adds or drops a priority must not leave a stale key
			// weighting something that no longer exists.
			merge: (persisted, current) => ({
				...current,
				weights: normalizeWeights(
					(persisted as { weights?: unknown } | undefined)?.weights,
				),
			}),
			onRehydrateStorage: () => () => {
				usePriorityStore.setState({ hydrated: true });
			},
		},
	),
);
