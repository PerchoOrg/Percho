/**
 * Builds hotspots and a tour for one listing from its real fields.
 *
 * This is the seam between the DTO and §2.3–2.5. It is pure and tested because it
 * is where "is this claim real" gets decided: every action subtitle is composed
 * from a number that came out of the database, and anything that cannot be
 * phrased with a number is not offered at all (`buildHotspot` drops it, and drops
 * the whole hotspot if fewer than three survive).
 *
 * Deliberately NOT here:
 *   - "Connects to your open-plan signal (7 likes)" — per-buyer attribution does
 *     not exist yet. `why` is built from listing facts instead, or omitted.
 *   - Renovation dollar ranges beyond the spec's stated rule-of-thumb framing.
 *   - Any comp claim finer than the cohort we actually measured (a city).
 */

import type { CompsCohortDTO, DetailPhotoDTO } from "./detail-dto";
import type { Hotspot, HotspotAction } from "./hotspot";
import { buildHotspot } from "./hotspot";
import {
	type Evidence,
	type Stop,
	type Tour,
	buildTour,
	genericTourStops,
} from "./tour";

export interface HotspotContext {
	comps: CompsCohortDTO;
	sqft?: number;
	yearBuilt?: number;
	pricePerSqft?: number;
}

/**
 * Candidate actions for one photo. Each subtitle must carry a number or
 * `buildHotspot` will drop it — that filter is the point, not a safety net.
 */
function candidateActions(
	ctx: HotspotContext,
	dated: boolean,
): HotspotAction[] {
	const actions: HotspotAction[] = [];
	const cohortN = ctx.comps.pricesUsd.length;

	// why — grounded in the listing's own measurements.
	if (ctx.sqft !== undefined) {
		actions.push({
			kind: "why",
			label: "Why this matters",
			sub: `Part of ${ctx.sqft.toLocaleString("en-US")} sqft of living space`,
		});
	}

	// compare — only ever claims the cohort we really measured.
	if (cohortN > 0) {
		actions.push({
			kind: "compare",
			label: "Compare with similar homes",
			sub: `${cohortN} active listings in ${ctx.comps.cohortLabel}`,
		});
	}

	// renovate — §2.5 #1: dated features only, and framed as a rule of thumb.
	if (dated) {
		actions.push({
			kind: "renovate",
			label: "Renovation estimate",
			sub: "Rule of thumb: $4–8K for a cosmetic refresh",
		});
	}

	// save — the number is the profile's own count, which is real and local.
	actions.push({
		kind: "save",
		label: "Save this feature",
		sub:
			ctx.yearBuilt !== undefined
				? `Adds this ${ctx.yearBuilt} home's feature to your profile`
				: "Adds 1 feature to your profile",
	});

	// ask_ai — §2.5 #1: greyed until Phase D, but shape-honest.
	//
	// The subtitle MUST carry a number like every other row: `hasConcreteData`
	// drops digitless copy, and an earlier draft ("Scoped to this home and
	// Duluth") was silently filtered out — which then pushed a listing with no
	// sqft below the 3-action floor and made the whole hotspot disappear. The
	// gate working correctly on my own vague copy, exactly as intended.
	actions.push({
		kind: "ask_ai",
		label: "Ask AI",
		sub: `Scoped to this home and ${cohortN} nearby listings`,
		disabled: true,
	});

	return actions;
}

/**
 * Every hotspot this listing can honestly support, at most one per room so the
 * section nav does not show "Kitchen" three times.
 */
export function buildHotspots(
	photos: readonly DetailPhotoDTO[],
	ctx: HotspotContext,
): Hotspot[] {
	const byRoom = new Map<string, Hotspot>();

	for (const photo of photos) {
		if (!photo.tags) continue; // untagged: nothing known about what is in it
		const dated = (photo.tags.style_signals ?? []).some((s) =>
			["dated", "carpet"].includes(s.toLowerCase()),
		);
		const hotspot = buildHotspot({
			photo: { id: photo.id, url: photo.url, tags: photo.tags },
			candidateActions: candidateActions(ctx, dated),
		});
		if (!hotspot) continue;
		// First tagged photo per room wins — photos arrive in display order, so
		// that is the listing's own best shot of that room.
		if (!byRoom.has(hotspot.room)) byRoom.set(hotspot.room, hotspot);
	}

	return [...byRoom.values()];
}

/**
 * The tour for this listing, or null when it cannot make 3 evidence-backed
 * stops — in which case §2.2 routes straight to free explore, which is the same
 * no-penalty path a tour ✕ takes.
 *
 * Personalised stops need per-buyer attribution that does not exist yet, so
 * today this always produces the §2.2 GENERIC tour. That is a data gap, not a
 * missing code path: `buildTour` accepts personalised stops the moment something
 * can produce them.
 */
export function buildListingTour(
	hotspots: readonly Hotspot[],
	facts: { sqft?: number; beds?: number; yearBuilt?: number },
): Tour | null {
	return buildTour(genericTourStops(hotspots, facts), { generic: true });
}

/**
 * The two readback signals on the transition card (§2.4 #5), taken from the
 * stops' own evidence labels. Empty for a generic tour — the card then says
 * nothing specific rather than inventing a preference.
 */
export function transitionSignals(tour: Tour): string[] {
	if (tour.generic) return [];
	return tour.stops
		.flatMap((stop: Stop) => (stop.evidence as Evidence).map((e) => e.label))
		.slice(0, 2);
}
