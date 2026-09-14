/**
 * Compare (phase D, 05 §5.2) — 2–5 saved homes side by side on the
 * dimensions a buyer actually weighs. PURE: detail DTOs in, a table out.
 *
 * Reshaped in phase280 around the four aspects the owner named on
 * 2026-07-30 — Schools, Convenience, Safety, Potential — and de-texted in
 * phase281 (owner: "a lot of text"): school cells carry the percentage
 * only (the names live on each home's page), bounded figures carry a
 * `meter` so the renderer draws a bar instead of asking for a read, and
 * every note is cut to one short line. "The basics" (monthly cost, size,
 * HOA…) sit underneath, still ordered by the buyer's declared priorities
 * and still truncated by the screen. Price lives in the header column.
 *
 * Safety is a section with no numbers ON PURPOSE. There is no data source
 * (`packages/shared/src/lenses.ts` — fair-housing grounds, owner 2026-07),
 * so the section carries each home's researched safety notes (`insights`
 * with theme "safety") and says plainly that Percho does not score it.
 * Potential likewise gets today's signals — rent against price, asking
 * $/sqft against the city, days on market — never an invented trend.
 *
 * Deliberately NO composite score and no "winner" column: a single number
 * would be our opinion dressed as a fact, which is the thing the trust line
 * says Percho does not do. Each row is one figure per home, with the cell
 * blank when the data is missing rather than filled with a guess.
 */
import type { CompareAspect, CompareTableRow } from "../compare/table";
import {
	type PriorityKey,
	type PriorityWeights,
	orderByPriority,
} from "../priorities";
import { buildCost } from "./cost";
import type { ListingDetailDTO } from "./detail-dto";
import {
	DEFAULT_DOWN_FRACTION,
	formatUsd,
	parseHoaMonthlyUsd,
} from "./monthly";

export const COMPARE_MIN = 2;
/**
 * Raised 3 → 5 in phase272 (owner: "up to 5").
 *
 * The ceiling is a LAYOUT fact, not a preference. The screen draws one column
 * per home across ~358 pt of usable width; at 5 that is ~65 pt each, which is
 * the narrowest a cell can be and still hold "$3,912/mo" (~58 pt at 13 px).
 * Six would not fit, and the old label-on-the-left table could not fit five —
 * it left only ~45 pt. If a sixth is ever wanted the layout has to change
 * first, not this number.
 */
export const COMPARE_MAX = 5;

export interface CompareRow extends CompareTableRow {
	/** Which declared priority this row serves, for ordering. Undefined when
	 *  it serves none — such a row keeps its place rather than sinking. */
	priority?: PriorityKey;
}

export interface CompareTable {
	headers: {
		id: string;
		address: string;
		city: string;
		/** Formatted, so the header cell and a table cell can never disagree. */
		price?: string;
		thumbUrl?: string;
	}[];
	/** Always all four, in the owner's order, rows or not. */
	aspects: CompareAspect<CompareRow>[];
	/** Everything that isn't one of the four — ordered by declared priorities. */
	basics: CompareRow[];
}

const num = (n: number): string => Math.round(n).toLocaleString("en-US");

/** Metres → "0.4 mi", matching `SchoolsBlock`'s formatting. */
const miles = (m: number): string => {
	const mi = m / 1609.34;
	if (mi < 0.1) return "< 0.1 mi";
	return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
};

/** A row nobody has data for says nothing — drop it. */
const kept = (rows: CompareRow[]): CompareRow[] =>
	rows.filter((r) => r.cells.some((c) => c));

/**
 * `weights` reorders the BASICS so they open on what the buyer said matters —
 * the same contract as before phase280, now scoped to the rows that are not
 * one of the four aspects. It never adds, drops or reweights a figure.
 */
export function buildCompareTable(
	homes: ListingDetailDTO[],
	annualRate: number,
	weights?: PriorityWeights,
): CompareTable {
	const headers = homes.map((h) => ({
		id: h.id,
		address: h.address,
		city: h.city,
		...(h.price !== undefined ? { price: formatUsd(h.price) } : {}),
		thumbUrl: h.photos[0]?.url,
	}));

	const cost = homes.map((h) =>
		h.price !== undefined
			? buildCost({
					priceUsd: h.price,
					annualRate,
					downFraction: DEFAULT_DOWN_FRACTION,
					...(parseHoaMonthlyUsd(h.hoaRaw) !== undefined
						? { hoaMonthlyUsd: parseHoaMonthlyUsd(h.hoaRaw) }
						: {}),
				})
			: undefined,
	);

	// The percentage alone — the school names ran the cells to three lines
	// each (phase281, owner: "a lot of text") and live on the home's page
	// anyway. A school the state has no figure for is a dash, not a name.
	const schoolRow = (
		label: string,
		level: "elementary" | "middle" | "high",
	): CompareRow => {
		const pcts = homes.map(
			(h) => h.schools?.find((x) => x.level === level)?.proficiencyPct,
		);
		return {
			label,
			cells: pcts.map((p) =>
				p !== undefined ? `${Math.round(p)}%` : undefined,
			),
			meter: pcts,
			meterMax: 100,
		};
	};

	// The feed card's convenience dimension: errands + shopping + dining,
	// scored 0–10 from measured distances. `score: null` means "no source",
	// never zero — treat it exactly like a missing figure.
	const conv = homes.map((h) =>
		h.scores?.dims.find((d) => d.key === "convenience"),
	);

	// Researched notes with theme "safety" — cited prose, not a rating. The
	// cell carries the first headline; the home's page has the sources.
	const safetyNotes = homes.map((h) => {
		const notes = (h.insights ?? []).filter((i) => i.theme === "safety");
		const first = notes[0];
		if (!first) return undefined;
		return notes.length > 1
			? `${first.headline} · +${notes.length - 1} more`
			: first.headline;
	});

	const aspects: CompareAspect<CompareRow>[] = [
		{
			key: "schools",
			title: "Schools",
			note: "% proficient at the nearest public school",
			rows: kept([
				schoolRow("Elementary", "elementary"),
				schoolRow("Middle", "middle"),
				schoolRow("High", "high"),
			]),
		},
		{
			key: "convenience",
			title: "Convenience",
			note: "errands, shops & food — scored 0–10",
			rows: kept([
				{
					label: "Score",
					cells: conv.map((d) =>
						d && d.score !== null ? d.score.toFixed(1) : undefined,
					),
					meter: conv.map((d) => d?.score ?? undefined),
					meterMax: 10,
				},
				{
					label: "Closest",
					cells: conv.map((d) =>
						d?.nearestM !== undefined ? miles(d.nearestM) : undefined,
					),
				},
			]),
		},
		{
			key: "safety",
			title: "Safety",
			note: "not scored on purpose — no source we trust",
			rows: kept([{ label: "On record", cells: safetyNotes }]),
		},
		{
			key: "potential",
			title: "Potential",
			note: "today’s signals, not a forecast",
			rows: kept([
				{
					label: "Rent vs price",
					note: "typical yearly rent ÷ price",
					cells: homes.map((h) =>
						h.rentEstimate && h.price !== undefined && h.price > 0
							? `${(((h.rentEstimate.monthlyUsd * 12) / h.price) * 100).toFixed(1)}%`
							: undefined,
					),
				},
				{
					label: "Vs city",
					note: "$/sqft against its city’s actives",
					cells: homes.map((h) => {
						const median = h.comps.medianPricePerSqft;
						if (
							h.price === undefined ||
							h.sqft === undefined ||
							h.sqft <= 0 ||
							median === undefined ||
							median <= 0
						) {
							return undefined;
						}
						const frac = (h.price / h.sqft - median) / median;
						if (Math.abs(frac) < 0.02) return "about even";
						return `${Math.round(Math.abs(frac) * 100)}% ${frac < 0 ? "under" : "over"}`;
					}),
				},
				{
					label: "Days listed",
					cells: homes.map((h) =>
						h.daysOnMarket !== undefined ? String(h.daysOnMarket) : undefined,
					),
				},
			]),
		},
	];

	// No Price row — the price sits in the header column now, always in view.
	const basics: CompareRow[] = [
		{
			label: "Monthly",
			priority: "cost",
			note: `${(annualRate * 100).toFixed(2)}% rate, ${Math.round(DEFAULT_DOWN_FRACTION * 100)}% down, tax + insurance + upkeep + HOA`,
			cells: cost.map((c) => (c ? `${formatUsd(c.totalUsd)}/mo` : undefined)),
		},
		{
			label: "Per sqft",
			priority: "cost",
			cells: homes.map((h) =>
				h.price !== undefined && h.sqft !== undefined && h.sqft > 0
					? `$${num(h.price / h.sqft)}`
					: undefined,
			),
		},
		{
			label: "Beds · baths",
			cells: homes.map((h) =>
				h.beds !== undefined || h.baths !== undefined
					? `${h.beds ?? "—"} · ${h.baths ?? "—"}`
					: undefined,
			),
		},
		{
			label: "Sqft",
			cells: homes.map((h) =>
				h.sqft !== undefined && h.sqft > 0 ? num(h.sqft) : undefined,
			),
		},
		{
			label: "Year built",
			cells: homes.map((h) =>
				h.yearBuilt !== undefined ? String(h.yearBuilt) : undefined,
			),
		},
		{
			label: "HOA",
			priority: "cost",
			cells: homes.map((h) => {
				const hoa = parseHoaMonthlyUsd(h.hoaRaw);
				return hoa !== undefined ? `${formatUsd(hoa)}/mo` : h.hoaRaw;
			}),
		},
		{
			label: "Typical rent",
			priority: "cost",
			note: "Zillow ZORI for the ZIP",
			cells: homes.map((h) =>
				h.rentEstimate
					? `${formatUsd(h.rentEstimate.monthlyUsd)}/mo`
					: undefined,
			),
		},
		{
			label: "Neighbourhood",
			priority: "community",
			cells: homes.map((h) => h.neighborhood),
		},
	];

	const keptBasics = kept(basics);
	return {
		headers,
		aspects,
		basics: weights
			? orderByPriority(keptBasics, weights, (r) => r.priority)
			: keptBasics,
	};
}
