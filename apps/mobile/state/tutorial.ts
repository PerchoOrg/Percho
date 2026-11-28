/**
 * Whether the buyer has been through the feed's tutorial (phase416).
 *
 * Owner, 2026-11-28: 「第一次使用应该给一套教程」. It replaces the single
 * "Swipe for the next place" line of phase414, and the store that rationed it
 * (`swipe-hint`): a walk-through is shown ONCE, to the end or to Skip, and
 * never again — there is nothing to ration.
 *
 * A new key, so a buyer who learned the old like/pass swipe is walked through
 * the new controls too.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface TutorialState {
	done: boolean;
	/** True once the persisted state has been read back from AsyncStorage. */
	hydrated: boolean;
	/** Finished or skipped: it does not come back. */
	finish: () => void;
}

export const useTutorialStore = create<TutorialState>()(
	persist(
		(set) => ({
			done: false,
			hydrated: false,
			finish: () => set({ done: true }),
		}),
		{
			name: "percho-v3:feed-tutorial:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ done: s.done }),
			onRehydrateStorage: () => () => {
				useTutorialStore.setState({ hydrated: true });
			},
		},
	),
);
