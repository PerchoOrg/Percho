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
	applyInsightUnsure,
	applySkipLayer,
	applySwipe,
} from "../lib/feed/signals";

interface FeedSessionState {
	signals: SignalState;
	/** Card ids already shown — dedupes across pages (§1.7 pagination). */
	seenIds: readonly string[];
	/** Ask ids already answered, so a question never repeats. */
	answeredAskIds: readonly string[];
	/** Nth session for this install (§1.10 `session_n`). */
	sessionN: number;
	/** Epoch ms of the previous swipe, for §1.10 `dt_since_prev_swipe`. */
	lastSwipeAt?: number;
	hydrated: boolean;

	/** Record a swipe. Returns the resulting signals for advance evaluation. */
	recordSwipe: (
		card: FeedCardV3,
		verdict: SwipeVerdict,
		at: number,
	) => SignalState;
	/** "Not sure" on an insight card — records no preference, by design (§1.6). */
	recordInsightUnsure: (card: FeedCardV3) => void;
	skipLayer: (layer: FunnelLayer) => void;
	markSeen: (ids: readonly string[]) => void;
	/** Called once per app open, after hydration. */
	beginSession: () => void;
	/** Stage advanced: reset the per-stage swipe counter (§1.10). */
	resetStageCounter: () => void;
	/** Explicit user scope reset (You-tab). Clears evidence, not the stage. */
	clearSignals: () => void;
}

export const useFeedSession = create<FeedSessionState>()(
	persist(
		(set, get) => ({
			signals: EMPTY_SIGNALS,
			seenIds: [],
			answeredAskIds: [],
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
					answeredAskIds:
						card.kind === "ask" && !s.answeredAskIds.includes(card.id)
							? [...s.answeredAskIds, card.id]
							: s.answeredAskIds,
				}));
				return signals;
			},

			recordInsightUnsure: (card) =>
				set((s) => ({
					signals: applyInsightUnsure(s.signals, card),
					seenIds: s.seenIds.includes(card.id)
						? s.seenIds
						: [...s.seenIds, card.id],
				})),

			skipLayer: (layer) =>
				set((s) => ({ signals: applySkipLayer(s.signals, layer) })),

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

			resetStageCounter: () =>
				set((s) => ({ signals: { ...s.signals, swipesInStage: 0 } })),

			clearSignals: () =>
				set({
					signals: EMPTY_SIGNALS,
					seenIds: [],
					answeredAskIds: [],
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
				answeredAskIds: s.answeredAskIds,
				sessionN: s.sessionN,
			}),
			onRehydrateStorage: () => () => {
				useFeedSession.setState({ hydrated: true });
			},
		},
	),
);
