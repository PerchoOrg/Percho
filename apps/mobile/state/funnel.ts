/**
 * Discovery-funnel state machine skeleton (§0.2).
 *
 * 2026-08-15: the ask / challenge / insight / milestone cards were deleted, so
 * the stage machine has no preference input left — the feed is a single
 * unlocked mix and `stage` is pinned at 4. The store still exists because
 * search's "Your journey" strip reads `stage`; promotion and reset are gone.
 *
 * AsyncStorage rehydrates asynchronously, so the first render always reads
 * `stage: 4` no matter what is on disk. Consumers must gate on `hydrated`
 * before building a deck.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FunnelStage } from "../lib/feed/card-types";

interface FunnelState {
	stage: FunnelStage;
	/** False until the persisted stage has been read back from AsyncStorage. */
	hydrated: boolean;
}

export const useFunnelStore = create<FunnelState>()(
	persist<FunnelState>(
		() => ({
			stage: 4,
			hydrated: false,
		}),
		{
			name: "percho-v3:funnel:v1",
			storage: createJSONStorage(() => AsyncStorage),
			// The funnel collapsed (2026-08-15): whatever stage was persisted is
			// obsolete. Rehydrating a pre-collapse stage would unlock the wrong
			// mix, so the persisted stage is dropped on load.
			merge: () => ({ stage: 4, hydrated: true }),
			partialize: (s) => ({ stage: s.stage }) as FunnelState,
			onRehydrateStorage: () => () => {
				useFunnelStore.setState({ hydrated: true });
			},
		},
	),
);
