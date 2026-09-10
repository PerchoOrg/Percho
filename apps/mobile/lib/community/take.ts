/**
 * The communities take (phase270) — `lib/compare/take.ts` built from the
 * same figures `buildCommunityCompareTable` shows. PURE: DTOs in, prose out.
 *
 * The header comment on `compare-communities.ts` argues almost nothing here
 * has an agreed direction — more restaurants is not better if you wanted
 * quiet. That stays true, and it shapes what this take is allowed to say:
 *
 *   · The RESIDENT RATING is the one directed figure, so it is the only
 *     thing a lean may stand on — and only when the gap is real and the
 *     sample is named.
 *   · Everything else (review dimensions, nearby counts, owner-occupancy)
 *     is offered as CHARACTER — "this one is busier, that one steadier" —
 *     which is what a friend actually tells you about neighbourhoods.
 *
 * A nearby bucket the server omits is UNKNOWN, not zero (see the DTO), so a
 * contrast is only spoken when both sides have a count.
 */
import { type CompareTake, listJoin } from "../compare/take";
import {
	REVIEW_DIMENSIONS,
	REVIEW_DIMENSION_LABELS,
} from "../reviews/dimensions";
import type { CommunityDetailDTO } from "./detail-dto";
import { bucketLabel } from "./tour-buckets";

/** Rating gaps under this are noise at these sample sizes. */
const RATING_MIN_GAP = 0.4;
/** A review-dimension gap worth a sentence, on the 1–5 scale. */
const DIMENSION_MIN_GAP = 0.7;
/** A nearby-count contrast worth a sentence: at least double, and real. */
const NEARBY_MIN_COUNT = 5;
/** An owner-occupancy gap worth a sentence, in percentage points. */
const OWNER_MIN_GAP_PCT = 10;

/** "84%" → 84; undefined for anything that does not start with a number. */
function pct(c: CommunityDetailDTO, label: string): number | undefined {
	const raw = c.stats.find((s) => s.label === label)?.value;
	if (!raw) return undefined;
	const n = Number.parseFloat(raw.replace(/[,%]/g, ""));
	return Number.isFinite(n) ? n : undefined;
}

/** The review dimension with the widest real gap, spoken as character. */
function dimensionPoint(
	communities: readonly CommunityDetailDTO[],
): string | undefined {
	let best:
		| { label: string; hi: CommunityDetailDTO; hiV: number; loV: number }
		| undefined;
	for (const d of REVIEW_DIMENSIONS) {
		const rated = communities
			.map((c) => ({ c, v: c.reviews?.dimensionAvgs[d] }))
			.filter(
				(x): x is { c: CommunityDetailDTO; v: number } => x.v !== undefined,
			);
		if (rated.length < 2) continue;
		const sorted = [...rated].sort((a, b) => b.v - a.v);
		const hi = sorted[0];
		const lo = sorted[sorted.length - 1];
		if (!hi || !lo) continue;
		const gap = hi.v - lo.v;
		if (gap < DIMENSION_MIN_GAP) continue;
		if (!best || gap > best.hiV - best.loV) {
			best = {
				label: REVIEW_DIMENSION_LABELS[d].toLowerCase(),
				hi: hi.c,
				hiV: hi.v,
				loV: lo.v,
			};
		}
	}
	if (!best) return undefined;
	return `The clearest gap residents report is ${best.label}: ${best.hi.name} at ${best.hiV.toFixed(1)} against ${best.loV.toFixed(1)}.`;
}

/** The busiest real contrast in what is around each place, if there is one. */
function nearbyPoint(
	communities: readonly CommunityDetailDTO[],
): string | undefined {
	let best:
		| {
				label: string;
				hi: CommunityDetailDTO;
				hiN: number;
				lo: CommunityDetailDTO;
				loN: number;
		  }
		| undefined;
	const buckets = new Set(
		communities.flatMap((c) => (c.nearby ?? []).map((n) => n.bucket)),
	);
	for (const bucket of buckets) {
		const label = bucketLabel(bucket);
		if (label === null) continue;
		const counted = communities
			.map((c) => ({ c, n: c.nearby?.find((x) => x.bucket === bucket)?.count }))
			.filter(
				(x): x is { c: CommunityDetailDTO; n: number } => x.n !== undefined,
			);
		if (counted.length < 2) continue;
		const sorted = [...counted].sort((a, b) => b.n - a.n);
		const hi = sorted[0];
		const lo = sorted[sorted.length - 1];
		if (!hi || !lo) continue;
		if (hi.n < NEARBY_MIN_COUNT || hi.n < lo.n * 2) continue;
		if (!best || hi.n - lo.n > best.hiN - best.loN) {
			best = {
				label: label.toLowerCase(),
				hi: hi.c,
				hiN: hi.n,
				lo: lo.c,
				loN: lo.n,
			};
		}
	}
	if (!best) return undefined;
	return `There’s more around ${best.hi.name} on our map — ${best.hiN} ${best.label} to ${best.lo.name}’s ${best.loN}. Read that as livelier, or as less quiet.`;
}

/** The owner-occupancy contrast, when it is wide enough to mean something. */
function ownerPoint(
	communities: readonly CommunityDetailDTO[],
): string | undefined {
	const known = communities
		.map((c) => ({ c, v: pct(c, "Owner-occupied") }))
		.filter(
			(x): x is { c: CommunityDetailDTO; v: number } => x.v !== undefined,
		);
	if (known.length < 2) return undefined;
	const sorted = [...known].sort((a, b) => b.v - a.v);
	const hi = sorted[0];
	const lo = sorted[sorted.length - 1];
	if (!hi || !lo || hi.v - lo.v < OWNER_MIN_GAP_PCT) return undefined;
	return `${hi.c.name} is ${Math.round(hi.v)}% owner-occupied to ${lo.c.name}’s ${Math.round(lo.v)}% — usually the steadier streets.`;
}

/** Assumes 2–3 communities — the screen guards the count. */
export function buildCommunityTake(
	communities: readonly CommunityDetailDTO[],
): CompareTake {
	const rated = communities
		.map((c) => ({ c, r: c.reviews }))
		.filter(
			(
				x,
			): x is {
				c: CommunityDetailDTO;
				r: NonNullable<CommunityDetailDTO["reviews"]>;
			} => x.r !== undefined && x.r.count > 0,
		);

	const points = [
		dimensionPoint(communities),
		nearbyPoint(communities),
		ownerPoint(communities),
	].filter((p): p is string => p !== undefined);

	// The lean, when residents themselves separate the places.
	if (rated.length >= 2) {
		const sorted = [...rated].sort((a, b) => b.r.avgRating - a.r.avgRating);
		const hi = sorted[0];
		const lo = sorted[sorted.length - 1];
		if (hi && lo && hi.r.avgRating - lo.r.avgRating >= RATING_MIN_GAP) {
			const thin = sorted.filter((x) => x.r.count < 3);
			return {
				lead: `Going by the people who actually live there, I’d nudge you toward ${hi.c.name} — residents rate it ${hi.r.avgRating.toFixed(1)}, against ${lo.r.avgRating.toFixed(1)} for ${lo.c.name}.`,
				points,
				caveat:
					thin.length > 0
						? `Mind the sample, though: ${listJoin(thin.map((x) => `${x.c.name} has ${x.r.count === 1 ? "a single review" : `only ${x.r.count} reviews`}`))}.`
						: "Reviews are a few voices, not the street — walk it at school-run hour before you sign anything.",
			};
		}
	}

	if (points.length > 0) {
		return {
			lead:
				rated.length >= 2
					? "The residents’ own ratings won’t separate these — so here’s what does differ."
					: "No resident verdict separates these yet, so here’s what the map and the census can say.",
			points,
			caveat:
				"That tells you what each place is LIKE, not which is better — that part was never mine to call.",
		};
	}

	return {
		lead: "On what we have, these read as near twins — nothing I can point at splits them.",
		points: [],
		caveat:
			"Go stand in each one at school-run hour. That’ll tell you more than I can.",
	};
}
