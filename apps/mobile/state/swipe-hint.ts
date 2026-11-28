/**
 * The swipe-hint state (owner spec, 2026-08-13).
 *
 * On the FIRST entry to the feed the first card carries one line — "Swipe for
 * the next place" (`components/feed/SwipeHintChip.tsx`, phase414). Until then
 * the card moved by itself: a nudge to the left, and from phase365 a show of
 * being liked and then passed, which is what a swipe meant.
 * It must never nag:
 *
 *   - `hasDiscoveredSwipe` — set the moment the buyer completes ANY real
 *     swipe; the hint never plays again, ever.
 *   - `hintSessionsShown` — how many sessions saw the hint. The first real
 *     swipe is the discovery; short of that, we show the hint on at most
 *     `MAX_HINT_SESSIONS` (3) separate app opens, then stop even without a
 *     swipe.
 *
 * A session is the feed mounting (spec's "第一次进入 Feed"). The counter
 * increments when the hint PLAYS, not when the feed opens, so a returning
 * buyer who immediately swipes (and thus discovers) never burns a session.
 *
 * `recordSwipe` is called from the feed's decision handler — the same place
 * every real swipe verdict lands — so there is exactly one caller.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const MAX_HINT_SESSIONS = 3;

interface SwipeHintState {
	hasDiscoveredSwipe: boolean;
	hintSessionsShown: number;
	/** True once the persisted state has been read back from AsyncStorage. */
	hydrated: boolean;
	/** Marks the buyer as having discovered the swipe. Never un-sets. */
	recordSwipe: () => void;
	/** Marks a hint as played this session. Returns whether more may play. */
	recordHintShown: () => boolean;
}

export const useSwipeHintStore = create<SwipeHintState>()(
	persist(
		(set, get) => ({
			hasDiscoveredSwipe: false,
			hintSessionsShown: 0,
			hydrated: false,
			recordSwipe: () => set({ hasDiscoveredSwipe: true }),
			recordHintShown: () => {
				const { hasDiscoveredSwipe, hintSessionsShown } = get();
				if (hasDiscoveredSwipe) return false;
				if (hintSessionsShown >= MAX_HINT_SESSIONS) return false;
				set({ hintSessionsShown: hintSessionsShown + 1 });
				return true;
			},
		}),
		{
			// v2 (phase414): a swipe turns the page now instead of judging the
			// card, so a buyer who had "discovered" the old swipe is shown the
			// new line once.
			name: "percho-v3:swipe-hint:v2",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({
				hasDiscoveredSwipe: s.hasDiscoveredSwipe,
				hintSessionsShown: s.hintSessionsShown,
			}),
			onRehydrateStorage: () => () => {
				useSwipeHintStore.setState({ hydrated: true });
			},
		},
	),
);
