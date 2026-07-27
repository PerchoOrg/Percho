/**
 * Guided tour composition (`02-listing.md` §2.2 / §2.3).
 *
 * A tour is 3–5 ordered stops over the listing's hotspots. Its whole reason to
 * exist is the WHY block: each stop explains, with a number, why THIS buyer is
 * being shown THIS feature. That makes `evidence` the load-bearing field, and
 * canon states the iron law plainly: **无 evidence 的停靠点不允许生成.**
 *
 * So evidence is enforced twice, deliberately:
 *   - TYPE: `Stop.evidence` is `readonly [EvidenceRef, ...EvidenceRef[]]`, a
 *     non-empty tuple. `evidence: []` is a compile error at every construction
 *     site in the app.
 *   - RUNTIME: `assertStop` re-checks, because the server generates tours
 *     (`generateGuidedTour`, 05 §5.6 item 4) and a type erases at the network
 *     boundary. A payload with an empty array is REJECTED — that stop does not
 *     render — rather than displayed with an empty WHY block.
 *
 * EMPTY PROFILE (§2.2 note): a buyer with no signals gets a generic 3-stop tour
 * whose copy does not pretend to be personalised. Its evidence cites the LISTING
 * ("2,840 sqft"), never an invented preference, so the iron law holds without
 * lying about what we know.
 */

import type { Hotspot } from "./hotspot";

export const MIN_STOPS = 3;
export const MAX_STOPS = 5;

/**
 * One citation inside a WHY block. `count` is what makes the claim checkable and
 * is required for that reason: "Based on 7 likes with open-plan kitchens".
 */
export interface EvidenceRef {
	/** e.g. "likes with open-plan kitchens", or "this home" for generic tours. */
	label: string;
	/** The number the copy quotes. Non-negative. */
	count: number;
	/** Liked card ids behind the number, when they exist (tap → thumb strip). */
	sourceIds?: readonly string[];
}

/** Non-empty by construction — this tuple type IS iron law #1. */
export type Evidence = readonly [EvidenceRef, ...EvidenceRef[]];

export interface Stop {
	id: string;
	hotspot: Hotspot;
	/** §2.3 #3, serif 17.5. "You've [evidence]. [Feature] is why this fits." */
	why: string;
	evidence: Evidence;
}

/** A tour that passed both gates. 3–5 stops, every one with evidence. */
export interface Tour {
	stops: readonly Stop[];
	/** True when built from the generic fallback (no buyer signals yet). */
	generic: boolean;
}

/**
 * Runtime half of the iron law. Returns false for a stop whose evidence is
 * missing, empty, or numerically meaningless — a `count` of 0 would render as
 * "Based on 0 likes", which is worse than no citation at all.
 */
export function isValidStop(stop: {
	why?: unknown;
	evidence?: unknown;
}): boolean {
	if (typeof stop.why !== "string" || stop.why.trim() === "") return false;
	if (!Array.isArray(stop.evidence) || stop.evidence.length === 0) return false;
	return stop.evidence.every(
		(e) =>
			typeof e === "object" &&
			e !== null &&
			typeof (e as EvidenceRef).label === "string" &&
			(e as EvidenceRef).label.trim() !== "" &&
			Number.isFinite((e as EvidenceRef).count) &&
			(e as EvidenceRef).count > 0,
	);
}

/**
 * Filters a candidate stop list down to the valid ones and caps at MAX_STOPS.
 * Returns null when fewer than MIN_STOPS survive: a 2-stop "tour" is not a tour,
 * and §2.2 sends that buyer straight to free explore instead — which is also the
 * no-penalty path a tour X-out takes, so it is a route the UI already handles.
 */
export function buildTour(
	candidates: readonly Stop[],
	options: { generic?: boolean } = {},
): Tour | null {
	const valid = candidates.filter(isValidStop).slice(0, MAX_STOPS);
	if (valid.length < MIN_STOPS) return null;
	return { stops: valid, generic: options.generic === true };
}

/**
 * §2.2's generic fallback: Hero · Kitchen · Neighborhood, in that order, from
 * whatever hotspots exist. Copy is explicitly about the home, not the buyer.
 *
 * Returns null when the listing lacks the photo coverage for three distinct
 * rooms — again routing to free explore rather than padding the tour.
 */
export function genericTourStops(
	hotspots: readonly Hotspot[],
	facts: { sqft?: number; beds?: number; yearBuilt?: number },
): Stop[] {
	const chosen: { hotspot: Hotspot; why: string; evidence: Evidence }[] = [];
	const used = new Set<string>();

	/**
	 * Picks by PREFERENCE ORDER and skips anything already used.
	 *
	 * Both halves matter. `hotspots.find(h => rooms.includes(h.room))` walks the
	 * PHOTO order, so the outdoor stop — whose list ends in `exterior` as a last
	 * resort — would match the exterior photo the hero stop already took, get
	 * dropped as a duplicate, and silently yield a 2-stop tour (i.e. no tour at
	 * all). Iterating `rooms` outermost makes "backyard, else pool, else the
	 * exterior shot" mean what it reads like.
	 */
	const pick = (rooms: readonly string[]): Hotspot | undefined => {
		for (const room of rooms) {
			const found = hotspots.find((h) => h.room === room && !used.has(h.id));
			if (found) return found;
		}
		return undefined;
	};

	/**
	 * Last resort: any unused hotspot at all, in photo order.
	 *
	 * Needed because the three stops below name PREFERRED rooms, and a real
	 * listing's tagged photos frequently miss all of them. Probed against
	 * production (`scripts/probe-hotspots.ts`, 2026-07-27): a Suwanee listing with
	 * FOUR good hotspots — exterior, dining, living, kitchen — produced no tour,
	 * because the third stop only accepted backyard/pool/balcony/exterior and the
	 * exterior was already taken by stop 1. Photographers shoot what a house has;
	 * a tour that requires a backyard photo is a tour almost nobody gets.
	 *
	 * This does NOT weaken the iron law: the stop still carries real evidence, and
	 * a listing with fewer than 3 usable hotspots still yields no tour.
	 */
	const pickAny = (): Hotspot | undefined =>
		hotspots.find((h) => !used.has(h.id));

	const add = (
		hotspot: Hotspot | undefined,
		why: string,
		evidence: Evidence,
	) => {
		if (!hotspot || used.has(hotspot.id)) return;
		used.add(hotspot.id);
		chosen.push({ hotspot, why, evidence });
	};

	if (facts.sqft !== undefined && facts.sqft > 0) {
		add(
			pick(["exterior", "living"]) ?? pickAny(),
			"Start with the whole of it.",
			[{ label: "sqft in this home", count: facts.sqft }],
		);
	}
	if (facts.beds !== undefined && facts.beds > 0) {
		add(
			pick(["kitchen", "dining", "living"]) ?? pickAny(),
			"Where the day actually happens.",
			[{ label: "bedrooms alongside it", count: facts.beds }],
		);
	}
	if (facts.yearBuilt !== undefined && facts.yearBuilt > 0) {
		const outdoor = pick(["backyard", "pool", "balcony", "exterior"]);
		const third = outdoor ?? pickAny();
		// The copy has to follow the room actually chosen. "And what's outside."
		// over a photo of a study is the kind of small lie that makes a buyer stop
		// trusting the rest of the page.
		add(
			third,
			outdoor ? "And what's outside." : "One more thing worth seeing.",
			[{ label: "year it was built", count: facts.yearBuilt }],
		);
	}

	return chosen.map((c, i) => ({
		id: `generic-${i}-${c.hotspot.id}`,
		hotspot: c.hotspot,
		why: c.why,
		evidence: c.evidence,
	}));
}

/** §2.3 #1: "STOP 2 OF 4". 1-indexed for display. */
export function stopLabel(index: number, total: number): string {
	return `STOP ${index + 1} OF ${total}`;
}

/** §2.3 #5: the last stop's primary button reads "Finish tour →". */
export function isLastStop(index: number, total: number): boolean {
	return index === total - 1;
}
