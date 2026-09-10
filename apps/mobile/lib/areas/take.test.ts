import type { Area, AreaMetric, MetricKey } from "@percho/shared/lenses";
import { describe, expect, it } from "vitest";
import { buildAreaTake } from "./take";

function metric(m: MetricKey, value: number): AreaMetric {
	return {
		metric: m,
		value,
		unit: m.endsWith("_pct") ? "percent" : "usd_per_month",
		source: "test",
		asOf: "2024-12-31",
		estimated: false,
	};
}

function county(
	name: string,
	o: {
		tax?: number;
		school?: number;
		electric?: number;
		water?: number;
		trash?: number;
	},
): Area {
	const metrics: AreaMetric[] = [];
	if (o.tax !== undefined) metrics.push(metric("property_tax_rate_pct", o.tax));
	if (o.school !== undefined)
		metrics.push(metric("school_proficiency_pct", o.school));
	if (o.electric !== undefined)
		metrics.push(metric("electric_monthly_usd", o.electric));
	if (o.water !== undefined) metrics.push(metric("water_monthly_usd", o.water));
	if (o.trash !== undefined) metrics.push(metric("trash_monthly_usd", o.trash));
	return {
		key: name.toLowerCase(),
		name,
		kind: "county",
		state: "GA",
		metrics,
	};
}

const UTILITIES = { electric: 150, water: 60, trash: 28 };

describe("buildAreaTake", () => {
	it("leans on the area that is both the cheaper hold and the school win", () => {
		const take = buildAreaTake([
			county("Cobb", { tax: 0.72, school: 50, ...UTILITIES }),
			county("DeKalb", { tax: 1.04, school: 33, ...UTILITIES }),
		]);
		expect(take.lead).toContain("I’d lean Cobb County");
		expect(take.points.some((p) => p.includes("a month less to hold"))).toBe(
			true,
		);
		expect(take.points.some((p) => p.includes("% proficient"))).toBe(true);
		// Identical utilities means the whole cost gap IS the tax gap — the
		// take should explain the number, not just state it.
		expect(take.points.some((p) => p.includes("property tax"))).toBe(true);
	});

	it("names the classic trade when cost and schools point apart", () => {
		const take = buildAreaTake([
			county("Cheapside", { tax: 0.7, school: 30, ...UTILITIES }),
			county("Bookford", { tax: 1.1, school: 60, ...UTILITIES }),
		]);
		expect(take.lead).toContain("classic trade");
		expect(take.lead).toContain("Cheapside County");
		expect(take.lead).toContain("Bookford County");
		expect(take.caveat).toContain("your call");
	});

	it("admits near twins when neither axis separates the areas", () => {
		const take = buildAreaTake([
			county("Alpha", { tax: 0.8, school: 50, ...UTILITIES }),
			county("Beta", { tax: 0.8, school: 51, ...UTILITIES }),
		]);
		expect(take.lead).toContain("near twins");
		expect(take.points).toEqual([]);
	});

	it("leans on cost alone, and says so, when schools have no figures", () => {
		const take = buildAreaTake([
			county("Cobb", { tax: 0.72, ...UTILITIES }),
			county("DeKalb", { tax: 1.04, ...UTILITIES }),
		]);
		expect(take.lead).toContain("I’d lean Cobb County");
		expect(take.caveat).toContain("school figures");
	});
});
