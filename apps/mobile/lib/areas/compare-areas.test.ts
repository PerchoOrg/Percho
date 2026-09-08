import type { Area, AreaMetric, MetricKey } from "@percho/shared/lenses";
import { describe, expect, it } from "vitest";
import { buildAreaCompareTable } from "./compare-areas";

function metric(m: MetricKey, value: number, estimated = false): AreaMetric {
	return {
		metric: m,
		value,
		unit: m.endsWith("_pct") ? "percent" : "usd_per_month",
		source: "test",
		asOf: "2024-12-31",
		estimated,
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
	estimated = false,
): Area {
	const metrics: AreaMetric[] = [];
	if (o.tax !== undefined)
		metrics.push(metric("property_tax_rate_pct", o.tax, estimated));
	if (o.school !== undefined)
		metrics.push(metric("school_proficiency_pct", o.school, estimated));
	if (o.electric !== undefined)
		metrics.push(metric("electric_monthly_usd", o.electric, estimated));
	if (o.water !== undefined)
		metrics.push(metric("water_monthly_usd", o.water, estimated));
	if (o.trash !== undefined)
		metrics.push(metric("trash_monthly_usd", o.trash, estimated));
	return {
		key: name.toLowerCase(),
		name,
		kind: "county",
		state: "GA",
		metrics,
	};
}

const COBB = county("Cobb", {
	tax: 0.72,
	school: 50,
	electric: 148,
	water: 58,
	trash: 28,
});
const DEKALB = county("DeKalb", {
	tax: 1.04,
	school: 33,
	electric: 165,
	water: 92,
	trash: 30,
});
const FORSYTH = county("Forsyth", {
	tax: 0.77,
	school: 62,
	electric: 142,
	water: 65,
	trash: 27,
});

const rowOf = (t: ReturnType<typeof buildAreaCompareTable>, label: string) => {
	const r = t.rows.find((x) => x.label.startsWith(label));
	if (!r) throw new Error(`no row ${label}`);
	return r;
};

describe("buildAreaCompareTable", () => {
	const table = buildAreaCompareTable([COBB, DEKALB, FORSYTH]);

	it("keeps the caller's column order", () => {
		expect(table.headers.map((h) => h.name)).toEqual([
			"Cobb",
			"DeKalb",
			"Forsyth",
		]);
	});

	it("leads with true monthly cost — the study's #1 post-move regret", () => {
		expect(table.rows[0]?.label).toMatch(/true cost/i);
	});

	it("marks the cheapest area best on a cost row", () => {
		const cost = rowOf(table, "True cost");
		expect(cost.cells.map((c) => c.best)).toEqual([true, false, false]);
	});

	it("marks the strongest district best on schools — direction is per row", () => {
		const schools = rowOf(table, "Schools");
		expect(schools.cells.map((c) => c.best)).toEqual([false, false, true]);
	});

	it("never marks a winner where every column is the same", () => {
		// Insurance is one metro-wide assumption; ticking all three would read
		// as three winners rather than as "no difference here".
		const ins = rowOf(table, "Insurance");
		expect(ins.cells.every((c) => c.best === false)).toBe(true);
		expect(new Set(ins.cells.map((c) => c.text)).size).toBe(1);
	});

	it("declares no overall winner — that judgement is the buyer's", () => {
		const labels = table.rows.map((r) => r.label.toLowerCase()).join(" ");
		expect(labels).not.toMatch(/total|score|overall|winner|rank/);
	});

	it("has no cost row for an area missing an input, and does not zero it", () => {
		const partial = county("Partial", { tax: 0.9 });
		const t = buildAreaCompareTable([COBB, partial]);
		const cost = rowOf(t, "True cost");
		expect(cost.cells[1]?.text).toBeUndefined();
		expect(cost.cells[1]?.best).toBe(false);
		// Cobb is the only figure present, so there is nothing to be best AT.
		expect(cost.cells[0]?.best).toBe(false);
	});

	it("still fills the rows an area does have", () => {
		const partial = county("Partial", { tax: 0.9 });
		const t = buildAreaCompareTable([COBB, partial]);
		expect(rowOf(t, "Property tax").cells[1]?.text).toBeDefined();
	});

	it("flags an estimated figure per cell, not per table", () => {
		const guessed = county(
			"Guessy",
			{ tax: 0.9, school: 40, electric: 150, water: 70, trash: 28 },
			true,
		);
		const t = buildAreaCompareTable([COBB, guessed]);
		const cost = rowOf(t, "True cost");
		expect(cost.cells[0]?.estimated).toBe(false);
		expect(cost.cells[1]?.estimated).toBe(true);
	});

	it("shows property tax as a yearly figure, since that is how it is billed", () => {
		const tax = rowOf(table, "Property tax");
		// 0.72% of $500k is $3,600/yr.
		expect(tax.cells[0]?.text).toBe("$3,600");
	});

	it("survives a single area, marking nothing best", () => {
		const t = buildAreaCompareTable([COBB]);
		expect(t.headers).toHaveLength(1);
		expect(t.rows.every((r) => r.cells.every((c) => !c.best))).toBe(true);
	});
});
