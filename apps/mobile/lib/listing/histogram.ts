/**
 * Price distribution — the data face's 7-bucket mini chart (`02-listing.md`
 * §2.1 #5) and the full-size version in the explore Comps section (§2.4 #3).
 *
 * ONE function feeds both sizes. The mini chart is not a second, sloppier
 * histogram; it is the same buckets rendered smaller, so the bar the buyer taps
 * on the data face is provably the bar they land on in Comps.
 *
 * §2.1 #5 iron law: **fewer than 5 samples degrades to a single median line, and
 * NO fake chart is drawn.** Seven buckets over four sales is noise wearing the
 * costume of a distribution, and this codebase does not ship a chart that looks
 * more certain than its data.
 *
 * ANCHOR (verified against the remote 2026-07-27, and a real departure from the
 * spec's wording): §2.1 anchors the cohort on the **subdivision** ("Waterside").
 * Only **4 of 265** listing rows carry a `community_id`, so a subdivision cohort
 * is empty for 98% of homes. The caller therefore anchors on **city** and passes
 * that label through `cohortLabel` — the number stays a real median of a real
 * cohort, and the UI names which cohort rather than implying a subdivision it
 * never measured.
 */

/** §2.1 #5: "7 桶". */
export const BUCKET_COUNT = 7;

/** §2.1 #5: below this, no chart. */
export const MIN_SAMPLES_FOR_CHART = 5;

export interface HistogramBucket {
	/** Inclusive lower bound in USD. */
	fromUsd: number;
	/** Exclusive upper bound, except the last bucket which is inclusive. */
	toUsd: number;
	count: number;
	/** True for the bucket containing the subject home (rendered in --accent). */
	isSubject: boolean;
}

export interface Histogram {
	kind: "chart";
	buckets: readonly HistogramBucket[];
	/** Index into `buckets`, or -1 when the subject sits outside the cohort. */
	subjectBucketIndex: number;
	sampleSize: number;
	medianUsd: number;
	cohortLabel: string;
}

/** The §2.1 #5 degraded form: "median $612K · 30 sales", never a drawn chart. */
export interface HistogramSummary {
	kind: "summary";
	sampleSize: number;
	medianUsd: number;
	cohortLabel: string;
}

/** Nothing real to say. The section renders as absent — not as an empty chart. */
export interface HistogramEmpty {
	kind: "empty";
	cohortLabel: string;
}

export type PriceDistribution = Histogram | HistogramSummary | HistogramEmpty;

export function medianOf(sorted: readonly number[]): number {
	const n = sorted.length;
	if (n === 0) return 0;
	const mid = n >> 1;
	if (n % 2 === 1) return sorted[mid] ?? 0;
	const lower = sorted[mid - 1] ?? 0;
	const upper = sorted[mid] ?? 0;
	return Math.round((lower + upper) / 2);
}

export interface DistributionInput {
	/** Every comparable price in the cohort, unsorted is fine. */
	pricesUsd: readonly number[];
	/** The subject home's price, for the highlighted bucket. */
	subjectPriceUsd: number;
	/** e.g. "Duluth" — whatever cohort was actually measured (see file note). */
	cohortLabel: string;
}

/**
 * Bucketing rule: equal-width buckets spanning [min, max] of the cohort.
 *
 * The subject price is deliberately NOT included in the range calculation unless
 * it is also in `pricesUsd` — the cohort defines the axis, so an outlier subject
 * (a $2M home in a $400K city) cannot stretch the axis and flatten every real
 * bar into invisibility. Such a subject gets `subjectBucketIndex === -1` and the
 * UI shows it as off-scale, which is the honest rendering.
 */
export function buildDistribution(input: DistributionInput): PriceDistribution {
	const { subjectPriceUsd, cohortLabel } = input;
	const prices = input.pricesUsd
		.filter((p) => Number.isFinite(p) && p > 0)
		.slice()
		.sort((a, b) => a - b);

	if (prices.length === 0) return { kind: "empty", cohortLabel };

	const sampleSize = prices.length;
	const medianUsd = medianOf(prices);

	if (sampleSize < MIN_SAMPLES_FOR_CHART) {
		return { kind: "summary", sampleSize, medianUsd, cohortLabel };
	}

	// `sampleSize >= MIN_SAMPLES_FOR_CHART` guarantees both, but the compiler
	// runs with `noUncheckedIndexedAccess` and an assertion here would be a
	// silent landmine if that guard ever moves.
	const min = prices[0];
	const max = prices[sampleSize - 1];
	if (min === undefined || max === undefined) {
		return { kind: "summary", sampleSize, medianUsd, cohortLabel };
	}

	// A degenerate range (every comp priced identically) has no meaningful axis
	// to divide, so it degrades to the summary line rather than producing seven
	// buckets of width zero.
	if (max <= min) {
		return { kind: "summary", sampleSize, medianUsd, cohortLabel };
	}

	const width = (max - min) / BUCKET_COUNT;
	const buckets: HistogramBucket[] = [];
	for (let i = 0; i < BUCKET_COUNT; i++) {
		buckets.push({
			fromUsd: Math.round(min + width * i),
			toUsd: Math.round(min + width * (i + 1)),
			count: 0,
			isSubject: false,
		});
	}

	for (const price of prices) {
		const target = buckets[bucketIndexFor(price, min, width)];
		if (target) target.count++;
	}

	let subjectBucketIndex = -1;
	if (subjectPriceUsd >= min && subjectPriceUsd <= max) {
		subjectBucketIndex = bucketIndexFor(subjectPriceUsd, min, width);
		const subject = buckets[subjectBucketIndex];
		if (subject) {
			buckets[subjectBucketIndex] = { ...subject, isSubject: true };
		}
	}

	return {
		kind: "chart",
		buckets,
		subjectBucketIndex,
		sampleSize,
		medianUsd,
		cohortLabel,
	};
}

/**
 * Which bucket a price falls in. The top of the range clamps into the LAST
 * bucket: `(max - min) / width === BUCKET_COUNT` exactly, so the naive floor
 * yields index 7 — one past the end — for the single most expensive comp, and
 * for the subject home whenever it is the priciest. That off-by-one is the bug
 * this clamp exists to prevent, hence the boundary tests.
 */
function bucketIndexFor(price: number, min: number, width: number): number {
	const raw = Math.floor((price - min) / width);
	return Math.min(Math.max(raw, 0), BUCKET_COUNT - 1);
}

/** "$612K" — the compact form used in bucket axis labels and the summary line. */
export function formatCompactUsd(value: number): string {
	if (value >= 1_000_000) {
		const millions = value / 1_000_000;
		return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
	}
	return `$${Math.round(value / 1000)}K`;
}
