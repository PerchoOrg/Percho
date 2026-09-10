/**
 * Community compare (phase261) — 2–3 saved communities side by side.
 * PURE: detail DTOs in, a row table out.
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
 * the community we happen to know most about as the winner.
 *
 * So this follows `lib/listing/compare.ts` instead: every row is one figure per
 * community, no best cell, no total, no score. The one row with a real
 * direction — the resident rating — still gets no tick, because a table with a
 * single ticked row reads as a verdict on the whole column.
 *
 * A cell we have no figure for is `undefined` and renders as "—", never 0. The
 * distinction is load-bearing for `nearby`: the server omits a bucket it
 * counted as zero and one it never counted, and printing "0 parks" for a
 * community we simply have no POI sweep for would be inventing an absence.
 */
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
 * How many `nearby` bucket rows the table will draw.
 *
 * The union across three communities runs to dozens of buckets, and a table
 * that scrolls for a minute is not a comparison — it is a data dump the buyer
 * has to do the reading in. Ranked by the total across the compared set, so
 * the buckets that survive are the ones these particular places actually have.
 */
export const NEARBY_ROW_LIMIT = 6;

export interface CommunityCompareRow {
	label: string;
	/** Small print under the label — what the figure is, or where it is from. */
	note?: string;
	/** One cell per community, in the caller's order. `undefined` renders "—". */
	cells: (string | undefined)[];
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
	schools: "schools",
	transit: "commute",
	daily_errands: "commute",
	work_hubs: "commute",
	outdoor: "community",
	amenities: "community",
};

export interface CommunityCompareTable {
	headers: {
		id: string;
		slug: string;
		name: string;
		place: string;
		thumbUrl?: string;
	}[];
	rows: CommunityCompareRow[];
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

/**
 * The `nearby` buckets worth a row, most-common-first across the whole set.
 *
 * A bucket the phone has no label for is skipped rather than printed raw —
 * `NearbyChart` drops those for the same reason, and an unnamed row would be a
 * number with nothing to say what it counts.
 */
function nearbyRows(
	communities: readonly CommunityDetailDTO[],
): CommunityCompareRow[] {
	const totals = new Map<string, number>();
	for (const c of communities) {
		for (const n of c.nearby ?? []) {
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

/**
 * Rows in the order a buyer weighs them: what residents SAY first — it is the
 * only thing here no other Percho surface can tell them and the one figure
 * that came from a person — then who lives there, then what is around.
 */
export function buildCommunityCompareTable(
	communities: readonly CommunityDetailDTO[],
	/** Reorders rows to lead with what the buyer said matters. Never filters. */
	weights?: PriorityWeights,
): CommunityCompareTable {
	const rows: CommunityCompareRow[] = [
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
		},
		...REVIEW_DIMENSIONS.map((dim) => ({
			label: REVIEW_DIMENSION_LABELS[dim],
			note: "residents’ average, out of 5",
			priority: DIMENSION_PRIORITY[dim],
			cells: communities.map((c) => {
				const v = c.reviews?.dimensionAvgs[dim];
				return v === undefined ? undefined : v.toFixed(1);
			}),
		})),
		{
			label: "Owner-occupied",
			priority: "community",
			cells: statCells(communities, "Owner-occupied"),
		},
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

	// A row nobody has data for says nothing — drop it.
	const kept = rows.filter((r) => r.cells.some((c) => c !== undefined));
	return {
		headers: communities.map((c) => ({
			id: c.id,
			slug: c.slug,
			name: c.name,
			place: placeOf(c),
			...(c.heroUrl ? { thumbUrl: c.heroUrl } : {}),
		})),
		rows: weights ? orderByPriority(kept, weights, (r) => r.priority) : kept,
	};
}
