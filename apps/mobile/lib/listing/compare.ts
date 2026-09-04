/**
 * Compare (phase D, 05 §5.2) — 2–3 saved homes side by side on the
 * dimensions a buyer actually weighs. PURE: detail DTOs in, a row table out.
 *
 * Deliberately NO composite score and no "winner" column: a single number
 * would be our opinion dressed as a fact, which is the thing the trust line
 * says Percho does not do. Each row is one figure per home, with the cell
 * blank when the data is missing rather than filled with a guess.
 */
import { buildCost } from "./cost";
import type { ListingDetailDTO } from "./detail-dto";
import {
	DEFAULT_DOWN_FRACTION,
	formatUsd,
	parseHoaMonthlyUsd,
} from "./monthly";

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;

export interface CompareRow {
	label: string;
	/** One cell per home, in the caller's order. `undefined` renders as "—". */
	cells: (string | undefined)[];
	/** Small print under the label, e.g. the rate the monthly figure assumes. */
	note?: string;
}

export interface CompareTable {
	headers: { id: string; address: string; city: string; thumbUrl?: string }[];
	rows: CompareRow[];
}

const num = (n: number): string => Math.round(n).toLocaleString("en-US");

export function buildCompareTable(
	homes: ListingDetailDTO[],
	annualRate: number,
): CompareTable {
	const headers = homes.map((h) => ({
		id: h.id,
		address: h.address,
		city: h.city,
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

	const school = (level: "elementary" | "middle" | "high") =>
		homes.map((h) => {
			const s = h.schools?.find((x) => x.level === level);
			if (!s) return undefined;
			return s.proficiencyPct !== undefined
				? `${Math.round(s.proficiencyPct)}% · ${s.name}`
				: s.name;
		});

	const rows: CompareRow[] = [
		{
			label: "Price",
			cells: homes.map((h) =>
				h.price !== undefined ? formatUsd(h.price) : undefined,
			),
		},
		{
			label: "Monthly, all-in",
			note: `${(annualRate * 100).toFixed(2)}% rate, ${Math.round(DEFAULT_DOWN_FRACTION * 100)}% down, tax + insurance + upkeep + HOA`,
			cells: cost.map((c) => (c ? `${formatUsd(c.totalUsd)}/mo` : undefined)),
		},
		{
			label: "Per sqft",
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
			cells: homes.map((h) => {
				const hoa = parseHoaMonthlyUsd(h.hoaRaw);
				return hoa !== undefined ? `${formatUsd(hoa)}/mo` : h.hoaRaw;
			}),
		},
		{
			label: "Rent, typical",
			note: "Zillow ZORI for the ZIP",
			cells: homes.map((h) =>
				h.rentEstimate
					? `${formatUsd(h.rentEstimate.monthlyUsd)}/mo`
					: undefined,
			),
		},
		{
			label: "Elementary",
			note: "nearest · % proficient",
			cells: school("elementary"),
		},
		{ label: "Middle", cells: school("middle") },
		{ label: "High", cells: school("high") },
		{
			label: "Neighbourhood",
			cells: homes.map((h) => h.neighborhood),
		},
	];

	// A row nobody has data for says nothing — drop it.
	return { headers, rows: rows.filter((r) => r.cells.some((c) => c)) };
}
