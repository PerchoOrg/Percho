/**
 * Community compare (phase261) — 2–5 saved communities side by side.
 * PURE: detail DTOs in, a table out.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Saved could compare HOMES (`lib/listing/compare.ts`) and AREAS
 * (`lib/areas/compare-areas.ts`) and not the thing in between. Owner, on
 * device: "Saved can't compare communities". A buyer who has saved three
 * subdivisions is in exactly the position the buyer study put most of our
 * users in — deciding between a shortlist, not roaming a metro — and the Saved
 * tab was the one surface that already held that shortlist and could not act
 * on it.
 *
 * ── phase281: the owner's four aspects, same as homes ───────────────────────
 *
 * Owner on the phase280 homes compare: "similar strategy needs to be applied
 * for community comparison". So the table is the same frame: Schools /
 * Convenience / Safety / Potential sections first, "the basics" (what
 * residents say, who lives there, what's around) underneath. What each
 * section can honestly hold differs from homes: Schools is a count of mapped
 * places (no proficiency at community grain), Convenience is the residents'
 * Walkable rating plus the errands/shops/food count, Safety has NO source
 * (fair-housing — `lenses.ts`) and says so, and Potential holds the one
 * stability signal we have, owner-occupied share.
 *
 * ── No winner marked here, unlike the AREA table ────────────────────────────
 *
 * `compare-areas.ts` ticks the best cell in a row, and argues it is allowed to
 * because each of its rows is a measured quantity with an agreed direction —
 * a lower tax bill is lower for everyone.
 *
 * Almost nothing here has one. More restaurants is not better if you wanted
 * quiet. A higher median adult age is not better or worse, it is a different
 * neighbourhood. "Owner-occupied" cuts both ways. And "Residents on Nextdoor"
 * is partly a measure of OUR data coverage, so ranking on it would be marking
 * the community we happen to know most about as the winner. So: every row is
 * one figure per community, no best cell, no total, no score. (A rating out
 * of 5 gets a `meter` bar — that is the resident's own number drawn, not our
 * verdict.)
 *
 * A cell we have no figure for is `undefined` and renders as "—", never 0. The
 * distinction is load-bearing for `nearby`: the server omits a bucket it
 * counted as zero and one it never counted, and printing "0 parks" for a
 * community we simply have no POI sweep for would be inventing an absence.
 */
import type { CompareAspect, CompareTableRow } from "../compare/table";
import {
	type PriorityKey,
	type PriorityWeights,
	orderByPriority,
} from "../priorities";
import {
	REVIEW_DIMENSIONS,
	REVIEW_DIMENSION_LABELS,
	type ReviewDimension,
} from "../reviews/dimensions";
import type { CommunityDetailDTO } from "./detail-dto";
import { bucketLabel } from "./tour-buckets";

export const COMMUNITY_COMPARE_MIN = 2;
/** 3 → 5 in phase272, for the reason `lib/listing/compare.ts` states. */
export const COMMUNITY_COMPARE_MAX = 5;

/**
 * How many `nearby` bucket rows the basics will draw.
 *
 * The union across the compared set runs to dozens of buckets, and a table
 * that scrolls for a minute is not a comparison — it is a data dump the buyer
 * has to do the reading in. Ranked by the total across the compared set, so
 * the buckets that survive are the ones these particular places actually have.
 */
export const NEARBY_ROW_LIMIT = 6;

export interface CommunityCompareRow extends CompareTableRow {
	/** Which declared priority this row serves, for ordering only. */
	priority?: PriorityKey;
}

/** Which priority each resident-rated dimension speaks to. Mirrors `take.ts`. */
const DIMENSION_PRIORITY: Record<ReviewDimension, PriorityKey> = {
	quiet: "community",
	walkable: "commute",
	friendly: "community",
	value: "cost",
};

/**
 * A nearby bucket's priority. Only the ones with an unambiguous owner are
 * mapped — "Food" or "Shopping" are amenities to one buyer and noise to
 * another, and guessing would put a row at the top of someone's table on our
 * hunch rather than their answer.
 */
const BUCKET_PRIORITY: Record<string, PriorityKey> = {
	transit: "commute",
	work_hubs: "commute",
	outdoor: "community",
	amenities: "community",
};

/**
 * The buckets the aspect sections consume — the same three the homes
 * convenience score is built from, plus schools. Excluded from the basics'
 * nearby rows so a count never appears twice.
 */
const CONVENIENCE_BUCKETS = ["daily_errands", "shopping", "dining"] as const;
const ASPECT_BUCKETS = new Set<string>(["schools", ...CONVENIENCE_BUCKETS]);

export interface CommunityCompareTable {
	headers: {
		id: string;
		slug: string;
		name: string;
		place: string;
		thumbUrl?: string;
	}[];
	/** Always all four, in the owner's order, rows or not. */
	aspects: CompareAspect<CommunityCompareRow>[];
	/** Everything else — ordered by the buyer's declared priorities. */
	basics: CommunityCompareRow[];
}

/** "Woodstock, GA" — or whichever half we have, or nothing. */
function placeOf(c: CommunityDetailDTO): string {
	return [c.city, c.state].filter(Boolean).join(", ");
}

/** The verbatim value for one of the server's three stat labels. */
function statCells(
	communities: readonly CommunityDetailDTO[],
	label: string,
): (string | undefined)[] {
	return communities.map((c) => c.stats.find((s) => s.label === label)?.value);
}

/** One bucket's count per community, `undefined` when the server omitted it. */
function bucketCells(
	communities: readonly CommunityDetailDTO[],
	bucket: string,
): (number | undefined)[] {
	return communities.map(
		(c) => c.nearby?.find((n) => n.bucket === bucket)?.count,
	);
}

/** A row nobody has data for says nothing — drop it. */
const kept = (rows: CommunityCompareRow[]): CommunityCompareRow[] =>
	rows.filter((r) => r.cells.some((c) => c !== undefined));

/**
 * The `nearby` buckets worth a basics row, most-common-first across the set.
 *
 * A bucket the phone has no label for is skipped rather than printed raw —
 * `NearbyChart` drops those for the same reason, and an unnamed row would be a
 * number with nothing to say what it counts. Buckets an aspect section
 * already shows are skipped too.
 */
function nearbyRows(
	communities: readonly CommunityDetailDTO[],
): CommunityCompareRow[] {
	const totals = new Map<string, number>();
	for (const c of communities) {
		for (const n of c.nearby ?? []) {
			if (ASPECT_BUCKETS.has(n.bucket)) continue;
			if (bucketLabel(n.bucket) === null) continue;
			totals.set(n.bucket, (totals.get(n.bucket) ?? 0) + n.count);
		}
	}

	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, NEARBY_ROW_LIMIT)
		.map(([bucket]) => ({
			// Non-null: an unlabelled bucket never entered `totals`.
			label: bucketLabel(bucket) as string,
			...(BUCKET_PRIORITY[bucket] ? { priority: BUCKET_PRIORITY[bucket] } : {}),
			cells: communities.map((c) => {
				const hit = c.nearby?.find((n) => n.bucket === bucket);
				return hit ? String(hit.count) : undefined;
			}),
		}));
}

/** A resident-rated dimension as a row: "4.5" with a bar out of 5. */
function dimensionRow(
	communities: readonly CommunityDetailDTO[],
	dim: ReviewDimension,
): CommunityCompareRow {
	const values = communities.map((c) => c.reviews?.dimensionAvgs[dim]);
	return {
		label: REVIEW_DIMENSION_LABELS[dim],
		note: "residents, out of 5",
		priority: DIMENSION_PRIORITY[dim],
		cells: values.map((v) => (v === undefined ? undefined : v.toFixed(1))),
		meter: values,
		meterMax: 5,
	};
}

/**
 * `weights` reorders the BASICS to lead with what the buyer said matters.
 * Never filters. The four aspect sections keep the owner's fixed order.
 */
export function buildCommunityCompareTable(
	communities: readonly CommunityDetailDTO[],
	weights?: PriorityWeights,
): CommunityCompareTable {
	// Errands + shops + food as one count. Summed over the buckets the server
	// sent; a community with none of the three stays a dash, never a zero.
	const convCounts = communities.map((c) => {
		const counts = CONVENIENCE_BUCKETS.map(
			(b) => c.nearby?.find((n) => n.bucket === b)?.count,
		).filter((n): n is number => n !== undefined);
		return counts.length > 0
			? String(counts.reduce((a, b) => a + b, 0))
			: undefined;
	});

	const aspects: CompareAspect<CommunityCompareRow>[] = [
		{
			key: "schools",
			title: "Schools",
			note: "schools among the community’s mapped places",
			rows: kept([
				{
					label: "Nearby",
					cells: bucketCells(communities, "schools").map((n) =>
						n !== undefined ? String(n) : undefined,
					),
				},
			]),
		},
		{
			key: "convenience",
			title: "Convenience",
			rows: kept([
				dimensionRow(communities, "walkable"),
				{
					label: "Errands, shops & food",
					note: "mapped places nearby",
					cells: convCounts,
				},
			]),
		},
		{
			key: "safety",
			title: "Safety",
			note: "not scored on purpose — no source meets our bar",
			rows: [],
		},
		{
			key: "potential",
			title: "Potential",
			note: "no market history — this is a stability signal, not a forecast",
			rows: kept([
				{
					label: "Owner-occupied",
					cells: statCells(communities, "Owner-occupied"),
				},
			]),
		},
	];

	const basics: CommunityCompareRow[] = [
		{
			label: "Resident rating",
			note: "approved reviews only",
			priority: "community",
			cells: communities.map((c) =>
				c.reviews
					? `${c.reviews.avgRating.toFixed(1)} · ${c.reviews.count} review${
							c.reviews.count === 1 ? "" : "s"
						}`
					: undefined,
			),
			meter: communities.map((c) => c.reviews?.avgRating),
			meterMax: 5,
		},
		// Walkable lives in the Convenience section; the other three stay here.
		...REVIEW_DIMENSIONS.filter((d) => d !== "walkable").map((dim) =>
			dimensionRow(communities, dim),
		),
		{
			label: "Median adult age",
			cells: statCells(communities, "Median adult age"),
		},
		{
			label: "Residents on Nextdoor",
			note: "how many we have heard from, not the population",
			priority: "community",
			cells: statCells(communities, "Residents on Nextdoor"),
		},
		...nearbyRows(communities),
	];

	const keptBasics = kept(basics);
	return {
		headers: communities.map((c) => ({
			id: c.id,
			slug: c.slug,
			name: c.name,
			place: placeOf(c),
			...(c.heroUrl ? { thumbUrl: c.heroUrl } : {}),
		})),
		aspects,
		basics: weights
			? orderByPriority(keptBasics, weights, (r) => r.priority)
			: keptBasics,
	};
}
