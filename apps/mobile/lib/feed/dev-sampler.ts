/**
 * DEV-ONLY sampler deck — "3 of each kind, video cards first".
 *
 * WHY: the production mix (`ratios.ts` STAGE_MIX) is a funnel. Stage 0 shows no
 * listings AT ALL by §0.2, so testing a listing card on device means swiping
 * through asks and trade-offs until the funnel advances — which the owner hit
 * head-on: "现在我需要翻很多卡片才能看到listing 为了测试方便 暂时不用按照
 * production的规则来 每种来3张就好了" (2026-07-27).
 *
 * So this composes a flat deck of ~3 cards per kind, in a fixed order, with the
 * cards that carry a 9:16 VIDEO hoisted to the very front. It exists to exercise
 * every face quickly, not to model any real buyer journey.
 *
 * HARD BOUNDARIES — this is a test fixture for the ORDER, never for the DATA:
 *   - Every card is built by the same real constructors the production engine
 *     uses, over the same real pool. Nothing here fabricates a listing, a price,
 *     or a photo (`_MASTER.md`: no mock data).
 *   - The §0.2 listing gate is NOT bypassed on the server: the client asks for
 *     stage 4, which is genuinely unlocked, rather than the route handing
 *     listings to stage 0.
 *   - Off by default, and the switch is a build-time env var, so it cannot ship
 *     enabled by accident.
 *
 * Turn it on with `EXPO_PUBLIC_DEV_SAMPLER=1` in the shell that starts Expo.
 */

import type {
	AreaCardV3,
	AskCardV3,
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
} from "./card-types";
import {
	PREFERENCE_ASKS,
	TRADEOFFS,
	challengeFromListing,
	geoAskFor,
} from "./content";
import type { FeedPool } from "./generate-feed";

/** Cards per kind in the sampler deck. */
export const SAMPLER_PER_KIND = 3;

/** Read once at module load — `EXPO_PUBLIC_*` is inlined at bundle time. */
export function samplerEnabled(): boolean {
	return process.env.EXPO_PUBLIC_DEV_SAMPLER === "1";
}

function take<T>(items: readonly T[], n: number): T[] {
	return items.slice(0, n);
}

/**
 * Video-bearing cards first, then the rest, order otherwise preserved.
 *
 * The server already hoists video listings into the pool (`?videoFirst=1`), but
 * the DECK order is decided here, so without this the video cards would land
 * wherever the kind interleave put them.
 */
function videoFirst<T extends { videoUrl?: string }>(items: readonly T[]): T[] {
	return [
		...items.filter((i) => i.videoUrl),
		...items.filter((i) => !i.videoUrl),
	];
}

export interface SamplerInput {
	pool: FeedPool;
	/** Stage the funnel is really in — only used for cards whose copy needs it. */
	stage: number;
}

/**
 * A flat deck of ~3 cards per kind. Kinds with no real inventory are simply
 * absent — a sampler that renders an empty listing card would be testing
 * nothing.
 */
export function buildSamplerDeck(input: SamplerInput): FeedCardV3[] {
	const { pool } = input;

	const listings: ListingCardV3[] = take(
		videoFirst(pool.listings),
		SAMPLER_PER_KIND,
	).map(
		(l) => ({ ...l, tease: undefined, preview: undefined }) as ListingCardV3,
	);

	const communities: CommunityCardV3[] = take(
		videoFirst(pool.communities),
		SAMPLER_PER_KIND,
	);

	const areas: AreaCardV3[] = take(pool.geoUnits, SAMPLER_PER_KIND).map(
		(unit) => ({ kind: "area" as const, id: `area-${unit.id}`, unit }),
	);

	// Two preference asks plus one GEO ask, so both ask forms get exercised: the
	// geo variant is the only one that renders the map thumb (§1.2 #2).
	const asks: AskCardV3[] = take(PREFERENCE_ASKS, SAMPLER_PER_KIND - 1);
	const firstUnit = pool.geoUnits[0];
	if (firstUnit) asks.push(geoAskFor(firstUnit));

	const tradeoffs: FeedCardV3[] = take(TRADEOFFS, SAMPLER_PER_KIND);

	// Challenge cards are built from real listings and their real price NUMBER
	// (`pool.listingPrices`, not the formatted label — §1.6 cannot round the
	// answer). A listing with no known price simply yields no challenge card.
	const challenges: FeedCardV3[] = [];
	for (const listing of take(pool.listings, SAMPLER_PER_KIND)) {
		const c = challengeFromListing(listing, pool.listingPrices?.[listing.id]);
		if (c) challenges.push(c);
	}

	// Interleave so the deck reads like a feed rather than three blocks of the
	// same face — but with every video card still up front.
	const groups: FeedCardV3[][] = [
		listings,
		communities,
		areas,
		asks,
		tradeoffs,
		challenges,
	];

	const deck: FeedCardV3[] = [];
	// The video cards lead, unconditionally: that is the whole point of the flag.
	const leading = [...listings, ...communities].filter(
		(c) => "videoUrl" in c && c.videoUrl,
	);
	deck.push(...leading);

	const led = new Set(leading.map((c) => c.id));
	for (let round = 0; round < SAMPLER_PER_KIND; round++) {
		for (const group of groups) {
			const card = group[round];
			if (card && !led.has(card.id)) deck.push(card);
		}
	}
	return deck;
}

/** Re-exported for the screen's banner, so the label and the flag can't drift. */
export function samplerLabel(deck: readonly FeedCardV3[]): string {
	const withVideo = deck.filter(
		(c) => "videoUrl" in c && (c as { videoUrl?: string }).videoUrl,
	).length;
	return `DEV SAMPLER · ${deck.length} cards · ${withVideo} with video`;
}

/** `insightFor` is re-exported so a future sampler round can add insight cards. */
