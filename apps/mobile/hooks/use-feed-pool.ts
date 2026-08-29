/**
 * `useFeedPool` — fetches and accumulates the server pool for the current stage.
 *
 * §1.9's system states are all decided here rather than in the screen:
 *   - `loading` drives the skeleton (first load only, never on a prefetch),
 *   - `offline` is inferred from CONSECUTIVE fetch failures, not from a network
 *     API: `expo-network` is not installed and §1.9 does not justify a new
 *     dependency for a signal fetch already gives us (PLAN B10),
 *   - `exhausted` means the server said `done` — the engine decides separately
 *     whether the cards it can still compose are all repeats.
 *
 * Pages ACCUMULATE. The engine is pure over one pool and dedupes by `seenIds`,
 * so growing the pool is what lets a later page compose from everything fetched
 * so far instead of only the newest slice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { feedPoolUrl } from "../lib/api/base";
import type { FunnelStage } from "../lib/feed/card-types";
import { samplerEnabled } from "../lib/feed/dev-sampler";
import { EMPTY_POOL, type FeedPool } from "../lib/feed/generate-feed";
import { parsePoolResponse } from "../lib/feed/pool-dto";
import { FIRST_PAGE_SIZE, PAGE_RETRIES } from "../lib/feed/ratios";

/** The feed endpoint's own ceiling (`lib/zod/feed-pool.ts`). */
const SAMPLER_PAGE_SIZE = 40;

/** §1.9: two consecutive failures is offline; one is a blip worth retrying. */
const OFFLINE_AFTER_FAILURES = PAGE_RETRIES;

interface UseFeedPoolArgs {
	stage: FunnelStage;
	/** Funnel city scope + liked communities — the stage-3 preview join keys. */
	cities: readonly string[];
	likedCommunityIds: readonly string[];
	/** Hold off until the persisted stage has been read back (§1.7). */
	enabled: boolean;
}

interface UseFeedPoolResult {
	pool: FeedPool;
	loading: boolean;
	offline: boolean;
	/** The server has no more inventory behind the current offset. */
	exhausted: boolean;
	/** Fetch the next page. No-op while a fetch is in flight or when exhausted. */
	fetchMore: () => void;
	/** Retry after an offline stretch. Clears the failure streak. */
	retry: () => void;
}

function mergePool(prev: FeedPool, next: FeedPool): FeedPool {
	const byId = <T extends { id: string }>(
		a: readonly T[],
		b: readonly T[],
	): T[] => {
		const seen = new Set(a.map((x) => x.id));
		return [...a, ...b.filter((x) => !seen.has(x.id))];
	};
	return {
		// Geo units are the full city set on every response, not a page, so the
		// newest response wins rather than accumulating duplicates.
		geoUnits: next.geoUnits.length > 0 ? next.geoUnits : prev.geoUnits,
		listings: byId(prev.listings, next.listings),
		communities: byId(prev.communities, next.communities),
		// Trade-off door photos ACCUMULATE, newest winning a key it fills. Each
		// page resolves them over its own listings only, so a dim lit on page 1
		// must survive a page 2 whose rows happen to have no photo for it —
		// otherwise a door that was lit goes dark as the buyer pages.
		dimPhotos: { ...prev.dimPhotos, ...next.dimPhotos },
	};
}

export function useFeedPool({
	stage,
	cities,
	likedCommunityIds,
	enabled,
}: UseFeedPoolArgs): UseFeedPoolResult {
	const [pool, setPool] = useState<FeedPool>(EMPTY_POOL);
	const [loading, setLoading] = useState(false);
	const [offline, setOffline] = useState(false);
	const [exhausted, setExhausted] = useState(false);

	// Refs, not state: these are read inside the fetch to decide whether to run
	// at all, and reading them from state would capture a stale value in the
	// closure and let two fetches race for the same offset.
	const offsetRef = useRef(0);
	const inFlight = useRef(false);
	const failures = useRef(0);
	// A stage change invalidates in-flight work; the token lets a late response
	// from the old stage be discarded instead of merged into the new pool.
	const token = useRef(0);

	// Joined, because the caller derives these arrays per render: depending on
	// array identity would re-run the effect every render and refetch forever.
	const citiesKey = cities.join(",");
	const likedKey = likedCommunityIds.join(",");

	/**
	 * The scope keys are read through refs inside `load`, not closed over as
	 * dependencies.
	 *
	 * `cities` is derived from the buyer's geo signals, so it changes on almost
	 * every right-swipe. When `load` depended on it, the identity of `load`
	 * changed with it, which re-ran the reset effect below: a full refetch from
	 * offset 0 that threw away every accumulated page, mid-session, while the
	 * buyer was mid-deck. Combined with the screen's old `pool` dependency this
	 * was what replaced a card the buyer had already peeked at, about a
	 * round-trip after they swiped.
	 *
	 * Newly liked cities legitimately widen the pool, but that belongs in the
	 * NEXT page — `fetchMore` picks the current values up from these refs — never
	 * in a reset. Only a stage change invalidates what has already been fetched.
	 */
	const citiesRef = useRef(citiesKey);
	citiesRef.current = citiesKey;
	const likedRef = useRef(likedKey);
	likedRef.current = likedKey;

	const load = useCallback(
		async (reset: boolean) => {
			if (inFlight.current) return;
			inFlight.current = true;
			const mine = token.current;
			const offset = reset ? 0 : offsetRef.current;
			if (reset || offset === 0) setLoading(true);

			try {
				const scopedCities = citiesRef.current;
				const scopedLiked = likedRef.current;
				const res = await fetch(
					feedPoolUrl({
						// DEV SAMPLER: request the pool as stage 4 so listings and
						// communities are in the payload at all. The §0.2 gate is not
						// bypassed — stage 4 IS the unlocked stage, and the funnel store's
						// real stage is untouched; only this fetch asks for a fuller pool so
						// every card kind is testable without walking the funnel.
						stage: samplerEnabled() ? 4 : stage,
						offset,
						// The sampler asks for the server's maximum in one go. Its deck
						// is composed from whatever the pool holds, so a 12-card page
						// meant only the first twelve filmed cards were ever reachable —
						// with fifteen listings filmed, three were invisible however far
						// you swiped (owner 2026-08-21).
						limit: samplerEnabled() ? SAMPLER_PAGE_SIZE : FIRST_PAGE_SIZE,
						cities: scopedCities ? scopedCities.split(",") : [],
						likedCommunityIds: scopedLiked ? scopedLiked.split(",") : [],
						/**
						 * Every card in the deck has a video (owner 2026-08-21: "on ios,
						 * only show cards with videos, either community or listing").
						 *
						 * This overrides spec-v3 §0.7, which treats "no video" as a
						 * first-class card state — that stays true of the schema and of
						 * every other surface, but the phone deck now shows only what has
						 * been filmed. It is a deliberate narrowing of the inventory, not
						 * a rendering change: 15 listings and ~8 communities have a ready
						 * video today, out of 260 and 8,684.
						 *
						 * `videoFirst` is still what the dev sampler wants — it keeps the
						 * whole pool and only reorders, so the sampler can still exercise
						 * a photo-only card.
						 */
						videosOnly: true,
						// Dev sampler wants the video cards in the payload at all; the
						// server has to FETCH them, sorting a page cannot surface a row it
						// never read. See lib/feed/dev-sampler.ts.
						...(samplerEnabled() ? { videoFirst: true } : {}),
					}),
				);
				if (!res.ok) throw new Error(`feed pool: HTTP ${res.status}`);
				const parsed = parsePoolResponse(await res.json());
				if (mine !== token.current) return;

				failures.current = 0;
				setOffline(false);
				offsetRef.current =
					offset + (samplerEnabled() ? SAMPLER_PAGE_SIZE : FIRST_PAGE_SIZE);
				setExhausted(parsed.done);
				setPool((prev) => (reset ? parsed.pool : mergePool(prev, parsed.pool)));
			} catch {
				if (mine !== token.current) return;
				failures.current += 1;
				// §1.9 "两次静默重试": the first failure shows nothing at all. The bar
				// appears only once the network looks genuinely gone, so a single slow
				// request does not flash an offline warning at a buyer who is online.
				if (failures.current >= OFFLINE_AFTER_FAILURES) setOffline(true);
			} finally {
				if (mine === token.current) setLoading(false);
				inFlight.current = false;
			}
		},
		[stage],
	);

	// ONLY a stage change rebuilds the pool: the server gates its listing rows by
	// stage, so a stage-4 deck must not be composed from the stage-1 payload.
	// Nothing else may reset — see the note on `citiesRef` above.
	useEffect(() => {
		if (!enabled) return;
		token.current += 1;
		offsetRef.current = 0;
		failures.current = 0;
		setExhausted(false);
		void load(true);
	}, [enabled, load]);

	const fetchMore = useCallback(() => {
		if (exhausted || offline) return;
		void load(false);
	}, [exhausted, offline, load]);

	const retry = useCallback(() => {
		failures.current = 0;
		setOffline(false);
		void load(offsetRef.current === 0);
	}, [load]);

	return { pool, loading, offline, exhausted, fetchMore, retry };
}
