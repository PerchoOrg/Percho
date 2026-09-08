/**
 * Area compare — 2–3 candidate areas side by side, one row per dimension.
 * PURE: areas in, a row table out.
 *
 * ── Why this exists next to the lens map ───────────────────────────────────
 *
 * The map answers "where should I be looking?". This answers "which of my
 * three?", and the buyer study says that is where our users actually are:
 * asked what stage they were at, 5 of 10 were confirming specific homes and 4
 * were comparing two or three neighbourhoods. Almost nobody roams a metro.
 * A ranked list of 29 counties is the wrong shape for that question; three
 * columns is the right one.
 *
 * ── The one difference from `lib/listing/compare.ts` ───────────────────────
 *
 * That table deliberately marks no winner, because ranking whole HOMES on a
 * composite would be our opinion dressed as a fact. Here a row is a single
 * measured quantity with an agreed direction — a lower tax bill is lower for
 * everyone — so marking the best cell in a row states an arithmetic fact, not
 * a preference. What stays absent is the same thing: there is no total, no
 * score and no overall winner, because how much schools matter against cost
 * is exactly the judgement that belongs to the buyer.
 *
 * A cell with no data is `undefined` and renders as "—", never as a zero.
 */

import {
	type Area,
	LENSES,
	type Lens,
	type MetricKey,
	insuranceMonthlyUsd,
	taxMonthlyUsd,
} from "@percho/shared/lenses";
import {
	type PriorityKey,
	type PriorityWeights,
	orderByPriority,
} from "../priorities";

export const AREA_COMPARE_MIN = 2;
export const AREA_COMPARE_MAX = 3;

export interface AreaCompareCell {
	/** Formatted value, or undefined when we have no figure. */
	text?: string;
	/** True when this is the best cell in its row. Never true for a row where
	 *  fewer than two areas have a figure — "best of one" is not a comparison. */
	best: boolean;
	/** True when any input behind this figure is still an estimate. */
	estimated: boolean;
}

export interface AreaCompareRow {
	label: string;
	/** Reads under the label — what the number means, or what it assumes. */
	note?: string;
	cells: AreaCompareCell[];
	/** Which declared priority this row serves, for ordering. Undefined when
	 *  it serves none — such a row keeps its place rather than sinking. */
	priority?: PriorityKey;
}

export interface AreaCompareTable {
	headers: { key: string; name: string; state: string }[];
	rows: AreaCompareRow[];
}

function metricValue(area: Area, metric: MetricKey): number | undefined {
	return area.metrics.find((m) => m.metric === metric)?.value;
}

function isEstimated(area: Area, metrics: readonly MetricKey[]): boolean {
	return area.metrics.some((m) => m.estimated && metrics.includes(m.metric));
}

/** Builds one row, marking the best cell by the row's own direction. */
function row(
	label: string,
	note: string | undefined,
	areas: readonly Area[],
	inputs: readonly MetricKey[],
	compute: (a: Area) => number | undefined,
	format: (v: number) => string,
	betterIsLow: boolean,
	priority: PriorityKey | undefined,
): AreaCompareRow {
	const values = areas.map(compute);
	const present = values.filter((v): v is number => v !== undefined);
	const lo = Math.min(...present);
	const hi = Math.max(...present);
	// Nothing is "best" unless at least two areas have a figure AND they
	// differ. Fewer than two is not a comparison; an all-way tie (insurance,
	// which is the same assumption everywhere) would otherwise tick every cell
	// in the row, which reads as five winners rather than as "no difference".
	const best =
		present.length >= 2 && lo !== hi ? (betterIsLow ? lo : hi) : undefined;

	return {
		label,
		...(note ? { note } : {}),
		...(priority ? { priority } : {}),
		cells: areas.map((area, i) => {
			const v = values[i];
			return {
				...(v !== undefined ? { text: format(v) } : {}),
				best: v !== undefined && best !== undefined && v === best,
				estimated: v !== undefined && isEstimated(area, inputs),
			};
		}),
	};
}

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * True monthly cost first, because the study named hidden carrying cost as the
 * #1 thing buyers discovered only after moving in; then schools, which is what
 * they look up first; then the lines that make the cost up, so a difference in
 * the headline can be traced rather than taken on faith.
 */
export function buildAreaCompareTable(
	areas: readonly Area[],
	/** The buyer's declared priorities. Reorders rows so the table opens on
	 *  what they said matters; it never adds, drops or reweights a figure. */
	weights?: PriorityWeights,
): AreaCompareTable {
	const trueCost = LENSES.find((l) => l.id === "true_cost") as Lens | undefined;

	const rows: AreaCompareRow[] = [
		row(
			"True cost / month",
			"tax + utilities + trash + insurance, same $500k home",
			areas,
			trueCost?.inputs ?? [],
			(a) => trueCost?.compute((m) => metricValue(a, m)),
			usd,
			true,
			"cost",
		),
		row(
			"Schools",
			"district average, % proficient",
			areas,
			["school_proficiency_pct"],
			(a) => metricValue(a, "school_proficiency_pct"),
			(v) => `${Math.round(v)}%`,
			false,
			"schools",
		),
		row(
			"Property tax / year",
			"on a $500k home",
			areas,
			["property_tax_rate_pct"],
			(a) => {
				const rate = metricValue(a, "property_tax_rate_pct");
				return rate === undefined ? undefined : taxMonthlyUsd(rate) * 12;
			},
			usd,
			true,
			"cost",
		),
		row(
			"Utilities & trash / month",
			"electric · water · trash",
			areas,
			["electric_monthly_usd", "water_monthly_usd", "trash_monthly_usd"],
			(a) => {
				const e = metricValue(a, "electric_monthly_usd");
				const w = metricValue(a, "water_monthly_usd");
				const t = metricValue(a, "trash_monthly_usd");
				if (e === undefined || w === undefined || t === undefined) {
					return undefined;
				}
				return e + w + t;
			},
			usd,
			true,
			"cost",
		),
		row(
			"Insurance / month",
			"same assumption everywhere — it does not vary by county",
			areas,
			[],
			() => insuranceMonthlyUsd,
			usd,
			// Identical in every column by construction, so nothing is best.
			true,
			"cost",
		),
	];

	return {
		headers: areas.map((a) => ({ key: a.key, name: a.name, state: a.state })),
		rows: weights ? orderByPriority(rows, weights, (r) => r.priority) : rows,
	};
}
