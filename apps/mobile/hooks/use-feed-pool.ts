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
import { EMPTY_POOL, type FeedPool } from "../lib/feed/generate-feed";
import { parsePoolResponse } from "../lib/feed/pool-dto";
import { FIRST_PAGE_SIZE, PAGE_RETRIES } from "../lib/feed/ratios";

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
		listingPrices: { ...prev.listingPrices, ...next.listingPrices },
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
						stage,
						offset,
						limit: FIRST_PAGE_SIZE,
						cities: scopedCities ? scopedCities.split(",") : [],
						likedCommunityIds: scopedLiked ? scopedLiked.split(",") : [],
					}),
				);
				if (!res.ok) throw new Error(`feed pool: HTTP ${res.status}`);
				const parsed = parsePoolResponse(await res.json());
				if (mine !== token.current) return;

				failures.current = 0;
				setOffline(false);
				offsetRef.current = offset + FIRST_PAGE_SIZE;
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
