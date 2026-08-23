/**
 * Feed session store (§1.7 / §1.9) — everything the composition engine needs
 * that must survive a restart.
 *
 * Split from `funnel.ts` deliberately: `funnel.ts` owns the single monotonic
 * stage and is read by 04/05 too, while this store owns the *evidence* that
 * moves the stage. Keeping them separate lets a You-tab scope reset clear
 * signals without touching the stage machine's invariant, and keeps 04/05 from
 * accidentally depending on feed internals.
 *
 * All mutation delegates to the pure reducers in `lib/feed/signals.ts` — this
 * file holds no funnel logic of its own, so the boundary tests in
 * `signals.test.ts` / `stage-advance.test.ts` stay the source of truth.
 *
 * AsyncStorage rehydrates asynchronously: consumers MUST gate deck construction
 * on `hydrated`, or the first render composes a stage-0 deck for a returning
 * stage-3 user.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
	FeedCardV3,
	FunnelLayer,
	SwipeVerdict,
} from "../lib/feed/card-types";
import {
	EMPTY_SIGNALS,
	type SignalState,
	applyDimRemoval,
	applySkipLayer,
	applySwipe,
} from "../lib/feed/signals";

interface FeedSessionState {
	signals: SignalState;
	/** Card ids already shown — dedupes across pages (§1.7 pagination). */
	seenIds: readonly string[];
	/**
	 * LISTING cards actually swiped, lifetime (phase119). Distinct from
	 * `seenIds`, which mixes every card kind and also counts cards merely
	 * paged in — this is the honest denominator behind the FitCard's
	 * "from N homes you've seen".
	 */
	seenListingIds: readonly string[];
	/** Nth session for this install (§1.10 `session_n`). */
	sessionN: number;
	/** Epoch ms of the previous swipe, for §1.10 `dt_since_prev_swipe`. */
	lastSwipeAt?: number;
	hydrated: boolean;

	/** Record a swipe. Returns the resulting signals. */
	recordSwipe: (
		card: FeedCardV3,
		verdict: SwipeVerdict,
		at: number,
	) => SignalState;
	skipLayer: (layer: FunnelLayer) => void;
	/** You-tab evidence correction: "No, remove" on one preference dim. */
	removeDim: (dim: string) => void;
	markSeen: (ids: readonly string[]) => void;
	/** Called once per app open, after hydration. */
	beginSession: () => void;
	/** Explicit user scope reset (You-tab). Clears evidence, not the stage. */
	clearSignals: () => void;
}

export const useFeedSession = create<FeedSessionState>()(
	persist(
		(set, get) => ({
			signals: EMPTY_SIGNALS,
			seenIds: [],
			seenListingIds: [],
			sessionN: 0,
			hydrated: false,

			recordSwipe: (card, verdict, at) => {
				const signals = applySwipe(get().signals, card, verdict);
				set((s) => ({
					signals,
					lastSwipeAt: at,
					seenIds: s.seenIds.includes(card.id)
						? s.seenIds
						: [...s.seenIds, card.id],
					...(card.kind === "listing" && !s.seenListingIds.includes(card.id)
						? { seenListingIds: [...s.seenListingIds, card.id] }
						: {}),
				}));
				return signals;
			},

			skipLayer: (layer) =>
				set((s) => ({ signals: applySkipLayer(s.signals, layer) })),

			removeDim: (dim) =>
				set((s) => ({ signals: applyDimRemoval(s.signals, dim) })),

			markSeen: (ids) =>
				set((s) => {
					const merged = new Set(s.seenIds);
					for (const id of ids) merged.add(id);
					return merged.size === s.seenIds.length
						? s
						: { seenIds: [...merged] };
				}),

			beginSession: () =>
				set((s) => ({
					sessionN: s.sessionN + 1,
					lastSwipeAt: undefined,
				})),

			clearSignals: () =>
				set({
					signals: EMPTY_SIGNALS,
					seenIds: [],
					seenListingIds: [],
					lastSwipeAt: undefined,
				}),
		}),
		{
			name: "percho-v3:feed-session:v1",
			storage: createJSONStorage(() => AsyncStorage),
			// `lastSwipeAt` is intentionally NOT persisted: a dt_since_prev_swipe
			// spanning an app restart would report hours of "hesitation".
			partialize: (s) => ({
				signals: s.signals,
				seenIds: s.seenIds,
				seenListingIds: s.seenListingIds,
				sessionN: s.sessionN,
			}),
			onRehydrateStorage: () => () => {
				useFeedSession.setState({ hydrated: true });
			},
		},
	),
);
