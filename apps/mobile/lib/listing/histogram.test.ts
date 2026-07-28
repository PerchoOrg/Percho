import { describe, expect, it } from "vitest";
import {
	BUCKET_COUNT,
	MIN_SAMPLES_FOR_CHART,
	buildDistribution,
	formatCompactUsd,
	medianOf,
} from "./histogram";

const label = "Duluth";

describe("buildDistribution — the §2.1 #5 degradation gate", () => {
	it("degrades at 4 samples: a summary line, NOT a chart", () => {
		const d = buildDistribution({
			pricesUsd: [300_000, 350_000, 400_000, 450_000],
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		expect(d.kind).toBe("summary");
		if (d.kind === "summary") {
			expect(d.sampleSize).toBe(4);
			expect(d.medianUsd).toBe(375_000);
		}
	});

	it("draws a chart at exactly 5 — the boundary is inclusive", () => {
		const d = buildDistribution({
			pricesUsd: [300_000, 350_000, 400_000, 450_000, 500_000],
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		expect(MIN_SAMPLES_FOR_CHART).toBe(5);
		expect(d.kind).toBe("chart");
	});

	it("is empty (not a zeroed chart) when the cohort has nothing real", () => {
		const d = buildDistribution({
			pricesUsd: [],
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		expect(d.kind).toBe("empty");
	});

	it("degrades when every comp is priced identically — no zero-width axis", () => {
		const d = buildDistribution({
			pricesUsd: [400_000, 400_000, 400_000, 400_000, 400_000, 400_000],
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		expect(d.kind).toBe("summary");
	});

	it("ignores junk prices rather than bucketing them", () => {
		const d = buildDistribution({
			pricesUsd: [
				0,
				-5,
				Number.NaN,
				300_000,
				350_000,
				400_000,
				450_000,
				500_000,
			],
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		expect(d.kind).toBe("chart");
		if (d.kind === "chart") expect(d.sampleSize).toBe(5);
	});
});

describe("buildDistribution — bucket geometry", () => {
	const prices = [
		200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000, 550_000,
		600_000, 900_000,
	];

	it("always emits exactly 7 buckets", () => {
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		expect(BUCKET_COUNT).toBe(7);
		expect(d.buckets).toHaveLength(7);
	});

	it("counts every sample exactly once", () => {
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		const total = d.buckets.reduce((sum, b) => sum + b.count, 0);
		expect(total).toBe(prices.length);
	});

	it("puts the MOST EXPENSIVE comp in the last bucket, not one past the end", () => {
		// The off-by-one this clamp exists for: (max-min)/width === 7 exactly, so a
		// naive floor yields index 7 and the priciest comp vanishes from the chart.
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 900_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		expect(d.subjectBucketIndex).toBe(6);
		const last = d.buckets[6];
		expect(last?.count).toBeGreaterThan(0);
		expect(last?.isSubject).toBe(true);
	});

	it("puts the cheapest comp in the first bucket", () => {
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 200_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		expect(d.subjectBucketIndex).toBe(0);
		expect(d.buckets[0]?.isSubject).toBe(true);
	});

	it("marks exactly one subject bucket", () => {
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 420_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		expect(d.buckets.filter((b) => b.isSubject)).toHaveLength(1);
	});

	it("reports an off-scale subject as -1 instead of clamping it into a bar", () => {
		// A $2M home in a $400K cohort. Forcing it into bucket 6 would tell the
		// buyer it is merely "at the top of the range" — a false claim.
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 2_000_000,
			cohortLabel: label,
		});
		if (d.kind !== "chart") throw new Error("expected chart");
		expect(d.subjectBucketIndex).toBe(-1);
		expect(d.buckets.some((b) => b.isSubject)).toBe(false);
	});

	it("does not let an outlier SUBJECT stretch the axis", () => {
		const normal = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 400_000,
			cohortLabel: label,
		});
		const outlier = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 5_000_000,
			cohortLabel: label,
		});
		if (normal.kind !== "chart" || outlier.kind !== "chart") {
			throw new Error("expected charts");
		}
		expect(outlier.buckets.map((b) => b.fromUsd)).toEqual(
			normal.buckets.map((b) => b.fromUsd),
		);
	});

	it("carries the cohort label through so the UI never implies a subdivision", () => {
		const d = buildDistribution({
			pricesUsd: prices,
			subjectPriceUsd: 400_000,
			cohortLabel: "Duluth",
		});
		expect(d.cohortLabel).toBe("Duluth");
	});
});

describe("medianOf", () => {
	it("handles odd, even, and empty", () => {
		expect(medianOf([1, 2, 3])).toBe(2);
		expect(medianOf([1, 2, 3, 4])).toBe(3); // rounds the .5
		expect(medianOf([])).toBe(0);
	});
});

describe("formatCompactUsd", () => {
	it("formats thousands and millions", () => {
		expect(formatCompactUsd(612_000)).toBe("$612K");
		expect(formatCompactUsd(1_000_000)).toBe("$1M");
		expect(formatCompactUsd(1_250_000)).toBe("$1.3M");
	});
});
