/**
 * What the CITY side-by-side draws (phase402) — the community comparison's
 * cards, filled from the city page's own five tiles. PURE: city detail DTOs
 * in, the shared `CompareVisuals` out.
 *
 * Owner 2026-11-25: 「city compare还是之前的版本 改成community compare的版本」.
 * Two saved cities used to open the county table (`/compare-areas`): "the
 * same $500k home" in each county — and two cities in one county, Suwanee and
 * Duluth, could not be compared at all. Each city now brings what its page
 * shows, section for section:
 *
 *   Safety       FEMA's overall and flood ratings; violent crime in words
 *   Schools      the best-standing school at each level, as a ring
 *   Convenience  the closest of each everyday kind; the first two drives
 *   Potential    residents, census by census, as lines; the published forecast
 *   Cost         a month to hold the typical home; its value; the rent
 *
 * Nothing is ranked and no cell is marked best — the same rule as the
 * community cards. A city with no figure gets a dash.
 */
import type { CityDetailDTO } from "@percho/shared/city";
import {
	type CompareVisuals,
	type DistanceRow,
	type ShortLine,
	type TextRow,
	buildInShort,
	lowest,
} from "../community/compare-visuals";
import { axisTop } from "../community/explore";
import {
	TILE_DRIVES,
	crimeFigure,
	driveRows,
	fullSchoolName,
	shortRating,
} from "./page";

/**
 * Two cities at least. At most what the Saved tab lets you pick of an area
 * (`AREA_COMPARE_MAX`, five) — the cards' colours run to five — so no pick is
 * silently left out.
 */
export const CITY_COMPARE_MIN = 2;
export const CITY_COMPARE_MAX = 5;

/**
 * The city slugs behind a set of saved places, when EVERY one of them has a
 * city page — the city comparison's input. `null` when any does not: those
 * still open the county table, which is all there is for them. Duplicate
 * slugs collapse, so a city saved twice is one column.
 */
export function citySlugsOf(
	hrefs: readonly (string | undefined)[],
): string[] | null {
	const slugs = hrefs.map((h) => /^\/city\/([^/?#]+)$/.exec(h ?? "")?.[1]);
	if (slugs.some((s) => s === undefined)) return null;
	return [...new Set(slugs as string[])];
}

/** The slice of a city detail the cards read. */
export type VisualCity = Pick<
	CityDetailDTO,
	| "name"
	| "stats"
	| "compare"
	| "growth"
	| "education"
	| "gettingAround"
	| "everyday"
	| "hazards"
	| "crime"
	| "forecast"
	| "holding"
	| "allSchools"
	| "rankings"
	| "planning"
>;

const some = <T>(cells: readonly (T | undefined)[]): boolean =>
	cells.some((c) => c !== undefined);

/** Rows nobody has a figure for are not drawn. */
const kept = (rows: TextRow[]): TextRow[] => rows.filter((r) => some(r.cells));

function distanceRow(label: string, cells: DistanceRow["cells"]): DistanceRow {
	const far = Math.max(0, ...cells.map((c) => c?.miles ?? 0));
	return { label, axisMiles: Math.max(1, Math.ceil(far)), cells };
}

function safetyTexts(cities: readonly VisualCity[]): TextRow[] {
	return kept([
		{
			label: "Natural hazards, overall",
			cells: cities.map((c) =>
				c.hazards ? shortRating(c.hazards.overall) : undefined,
			),
		},
		{
			label: "Flood",
			cells: cities.map((c) => {
				const r = c.hazards?.rows.find((x) => x.label === "Flood");
				return r ? shortRating(r.rating) : undefined;
			}),
		},
		{
			label: "Violent crime",
			cells: cities.map((c) => crimeFigure(c) ?? undefined),
		},
	]);
}

const LEVELS = [
	["elementary", "Elementary"],
	["middle", "Middle"],
	["high", "High"],
] as const;

/** The best-standing school at each level, from the city's full list. */
function schoolsOf(cities: readonly VisualCity[]): CompareVisuals["schools"] {
	return LEVELS.map(([level, heading]) => ({
		level: heading,
		cells: cities.map((c) => {
			const best = (c.allSchools ?? [])
				.filter((s) => s.level === level)
				.sort((a, b) => a.share - b.share)[0];
			return best
				? {
						name: fullSchoolName(best.name),
						share: best.share,
						...(best.miles !== undefined
							? { distance: `${best.miles} mi` }
							: {}),
					}
				: undefined;
		}),
	})).filter((l) => some(l.cells));
}

/** The closest place of each everyday kind any of the cities lists. */
function convenienceOf(cities: readonly VisualCity[]): DistanceRow[] {
	const kinds: string[] = [];
	for (const c of cities) {
		for (const k of c.everyday ?? []) {
			if (!kinds.includes(k.kind)) kinds.push(k.kind);
		}
	}
	return kinds.map((kind) =>
		distanceRow(
			kind,
			cities.map((c) => {
				const first = c.everyday?.find((k) => k.kind === kind)?.places[0];
				return first ? { miles: first.miles, name: first.name } : undefined;
			}),
		),
	);
}

/** The first drives the cities' pages name, as their times. */
function driveTexts(cities: readonly VisualCity[]): TextRow[] {
	const drives = cities.map((c) => driveRows(c));
	const places: string[] = [];
	for (const rows of drives) {
		for (const r of rows) if (!places.includes(r.place)) places.push(r.place);
	}
	return kept(
		places.slice(0, TILE_DRIVES).map((place) => ({
			label: `Drive to ${place}`,
			cells: drives.map((rows) => rows.find((r) => r.place === place)?.time),
		})),
	);
}

/** "1990" → 1990; a label that is not a year → null. */
function yearOf(label: string): number | null {
	const y = Number(label.trim());
	return Number.isInteger(y) && y > 1000 ? y : null;
}

function potentialOf(
	cities: readonly VisualCity[],
): CompareVisuals["potential"] {
	const points = cities.map((c) =>
		c.growth.series.flatMap((p) => {
			const year = yearOf(p.label);
			return year === null ? [] : [{ year, value: p.value }];
		}),
	);
	if (!points.some((p) => p.length > 0)) return null;
	// One axis, so the years every city has — as the community value lines.
	const charted = points.filter((p) => p.length > 0);
	const years = (charted[0] ?? [])
		.map((p) => p.year)
		.filter((y) => charted.every((s) => s.some((p) => p.year === y)));
	const drawn = years.length >= 2 ? years : [];
	const series = points.map((p) =>
		p.length > 0 && drawn.length > 0
			? drawn.map((y) => p.find((x) => x.year === y)?.value ?? 0)
			: undefined,
	);
	const first = drawn[0];
	return {
		cells: points.map((p) => {
			const last = p[p.length - 1];
			if (!last) return undefined;
			const from = first !== undefined ? p.find((x) => x.year === first) : p[0];
			const change =
				from && from.year < last.year && from.value > 0
					? `${last.value >= from.value ? "+" : "−"}${Math.round(
							(Math.abs(last.value - from.value) / from.value) * 100,
						).toLocaleString("en-US")}% since ${from.year}`
					: "";
			return {
				display: last.value.toLocaleString("en-US"),
				change,
				area: `residents in ${last.year}`,
			};
		}),
		years: drawn,
		series,
		max: axisTop(series.flatMap((s) => s ?? [])),
	};
}

function forecastTexts(cities: readonly VisualCity[]): TextRow[] {
	return kept([
		{
			label: "Published forecast",
			cells: cities.map((c) =>
				c.forecast
					? `${c.forecast.area}: ${c.forecast.takeaway} by ${c.forecast.year}`
					: undefined,
			),
		},
	]);
}

const isHomeValue = (label: string) => /median home value/i.test(label);
const isRent = (label: string) => /^median rent$/i.test(label.trim());

function homeValueOf(c: VisualCity): string | undefined {
	return c.compare.rows.find((r) => isHomeValue(r.label))?.city.display;
}

function costOf(cities: readonly VisualCity[]): CompareVisuals["cost"] {
	const holding = cities.map((c) =>
		c.holding
			? {
					display: c.holding.display,
					usd: c.holding.rows.reduce((a, r) => a + r.usd, 0),
					rows: c.holding.rows.map((r) => ({ label: r.label, usd: r.usd })),
				}
			: undefined,
	);
	return some(holding) ? { holding, dues: cities.map(() => undefined) } : null;
}

function costTexts(cities: readonly VisualCity[]): TextRow[] {
	return kept([
		{ label: "Median home value", cells: cities.map(homeValueOf) },
		{
			label: "Median rent, a month",
			cells: cities.map((c) => c.stats.find((s) => isRent(s.label))?.value),
		},
	]);
}

export function buildCityCompareVisuals(
	cities: readonly VisualCity[],
): CompareVisuals {
	return {
		notes: {
			safety:
				"FEMA's natural-hazard ratings, and violent crime against Georgia",
			schools: "the best-standing school at each level, in Georgia",
			convenience: "the closest of each kind to the city's centre",
			potential: "how many people live there, census by census",
			cost: "to hold, to buy and to rent a home",
		},
		texts: {
			safety: safetyTexts(cities),
			convenience: driveTexts(cities),
			potential: forecastTexts(cities),
			cost: costTexts(cities),
		},
		safety: null,
		schools: schoolsOf(cities),
		convenience: convenienceOf(cities),
		potential: potentialOf(cities),
		cost: costOf(cities),
	};
}

/** "$480,600" → 480600. */
function dollars(display: string | undefined): number | undefined {
	const m = display?.match(/\$([\d,]+)/);
	return m?.[1] ? Number(m[1].replace(/,/g, "")) : undefined;
}

/**
 * The city comparison's "In short" (phase402): the community's lines that
 * carry over — best-ranked schools, the least to hold a home — then the
 * city's own: the nearest groceries and hospital, the lowest home values and
 * the shortest drive downtown. Same rule: a line only where the gap is real
 * and the direction is one nobody argues with. No line about crime: a city's
 * Safety box states it, and the comparison does not rank places by it.
 */
export function buildCityInShort(
	v: CompareVisuals,
	cities: readonly VisualCity[],
): ShortLine[] {
	// Potential is people, not prices, so the community's home-value line must
	// not read it; and there is no safety distance row for its hospital line.
	const lines = buildInShort({ ...v, potential: null, safety: null });

	const nearest = (label: string, minGap: number, say: string) => {
		const row = v.convenience.find((r) => r.label === label);
		const i = row
			? lowest(
					row.cells.map((c) => c?.miles),
					minGap,
				)
			: null;
		const c = i !== null ? row?.cells[i] : undefined;
		if (i !== null && c)
			lines.push({ place: i, text: `${say} — ${c.name}, ${c.miles} mi.` });
	};
	nearest("Groceries", 0.5, "The shortest trip for groceries");
	nearest("Hospital", 1, "The shortest drive to a hospital");

	const values = cities.map((c) => dollars(homeValueOf(c)));
	const cheapest = lowest(values, 0);
	const price = cheapest !== null ? values[cheapest] : undefined;
	if (
		cheapest !== null &&
		price !== undefined &&
		lowest(values, price * 0.05) === cheapest
	) {
		lines.push({
			place: cheapest,
			text: `The lowest home values — a median of ${homeValueOf(cities[cheapest] as VisualCity)}.`,
		});
	}

	const downtown = cities.map(
		(c) => driveRows(c).find((r) => /^downtown/i.test(r.place))?.minutes,
	);
	const quick = lowest(
		downtown.map((m) => m?.min),
		5,
	);
	const m = quick !== null ? downtown[quick] : undefined;
	if (quick !== null && m) {
		lines.push({
			place: quick,
			text: `The shortest drive downtown — ${m.min === m.max ? m.min : `${m.min}–${m.max}`} min.`,
		});
	}
	return lines;
}
