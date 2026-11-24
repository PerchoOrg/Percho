/**
 * The city page's charts, as data (phase333). PURE — the screen and its chart
 * components only draw what these return.
 *
 * Owner, 2026-11-15, on the first city page: "现在太多文字 又臭又长 重新设计 比如
 * 可以用一些图表". So every section is a figure first: the numbers become tiles
 * with their own small chart, the history a timeline of short labels, drive
 * times bars on one scale. Sentences survive only where a reader asks for them
 * (a tap on a timeline stop, a plan, the sources).
 */
import type { CityDetailDTO } from "@percho/shared/city";

type Fundamentals = Pick<
	CityDetailDTO,
	"stats" | "compare" | "growth" | "education" | "gettingAround" | "history"
>;

export type GlanceTile =
	| {
			kind: "growth";
			label: string;
			value: string;
			series: readonly { label: string; value: number }[];
			takeaway: string;
	  }
	| {
			kind: "compare";
			label: string;
			city: { value: number; display: string };
			state: { value: number; display: string };
			against: string;
			takeaway: string;
	  }
	| { kind: "share"; label: string; pct: number; value: string; note?: string }
	| { kind: "stat"; label: string; value: string; note?: string };

/** "59%" → 59; anything that is not a plain percentage → null. */
export function percentOf(value: string): number | null {
	const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());
	if (!m) return null;
	const pct = Number(m[1]);
	return pct >= 0 && pct <= 100 ? pct : null;
}

/**
 * The AT A GLANCE tiles: growth first (its last value IS the population, so a
 * separate population tile is dropped), then the state comparisons, then the
 * remaining stats — a percentage as a split bar, anything else as a figure.
 */
export function glanceTiles(d: Fundamentals): GlanceTile[] {
	const tiles: GlanceTile[] = [];
	const series = d.growth.series;
	const last = series[series.length - 1];
	if (series.length > 1 && last) {
		tiles.push({
			kind: "growth",
			label: "Residents",
			value: last.value.toLocaleString("en-US"),
			series,
			takeaway: d.growth.takeaway,
		});
	}
	for (const row of d.compare.rows) {
		tiles.push({
			kind: "compare",
			label: row.label,
			city: row.city,
			state: row.state,
			against: d.compare.against,
			takeaway: row.takeaway,
		});
	}
	for (const s of d.stats) {
		if (tiles[0]?.kind === "growth" && /^population$/i.test(s.label.trim()))
			continue;
		const pct = percentOf(s.value);
		tiles.push(
			pct === null
				? {
						kind: "stat",
						label: s.label,
						value: s.value,
						...(s.note ? { note: s.note } : {}),
					}
				: {
						kind: "share",
						label: s.label,
						pct,
						value: s.value,
						...(s.note ? { note: s.note } : {}),
					},
		);
	}
	return tiles;
}

type School = CityDetailDTO["education"]["schools"][number];

export const SCHOOL_COLUMNS = [
	["elementary", "Elementary"],
	["middle", "Middle"],
	["high", "High"],
] as const;

/** Schools as the page's three columns, best rank first, and the colleges apart. */
export function schoolColumns(schools: readonly School[]): {
	columns: { level: School["level"]; heading: string; schools: School[] }[];
	colleges: School[];
} {
	const rankNo = (s: School) =>
		Number((s.rank ?? "").replace(/[^\d]/g, "")) || Number.MAX_SAFE_INTEGER;
	const columns = SCHOOL_COLUMNS.map(([level, heading]) => ({
		level,
		heading,
		schools: schools
			.filter((s) => s.level === level)
			.sort((a, b) => rankNo(a) - rankNo(b)),
	})).filter((c) => c.schools.length > 0);
	return { columns, colleges: schools.filter((s) => s.level === "college") };
}

/**
 * The drive-time chart: the rows with minutes, on one axis rounded up to the
 * next half hour; the rest (no rail, the interstate) become chips.
 */
export function driveTimes(rows: Fundamentals["gettingAround"]): {
	bars: { label: string; min: number; max: number }[];
	axisMax: number;
	notes: { label: string; value: string }[];
} {
	const bars = rows.flatMap((r) =>
		r.minutes
			? [{ label: r.label, min: r.minutes.min, max: r.minutes.max }]
			: [],
	);
	const top = Math.max(0, ...bars.map((b) => b.max));
	return {
		bars,
		axisMax: Math.max(60, Math.ceil(top / 30) * 30),
		notes: rows
			.filter((r) => !r.minutes)
			.map((r) => ({ label: r.label, value: r.value })),
	};
}

/** A timeline stop's label: the profile's short one, else the first few words. */
export function stopLabel(e: Fundamentals["history"][number]): string {
	if (e.short) return e.short;
	const words = e.text.split(/\s+/).slice(0, 3).join(" ");
	return words.replace(/[,;:—.]+$/, "");
}

// ─── the five tiles (phase371) ──────────────────────────────────────────────

type City = Pick<
	CityDetailDTO,
	| "rankings"
	| "stats"
	| "compare"
	| "growth"
	| "education"
	| "gettingAround"
	| "planning"
	| "everyday"
	| "hazards"
	| "crime"
>;

/** "South Forsyth Middle" → "South Forsyth Middle School"; any other name as it is. */
export function fullSchoolName(name: string): string {
	return /\b(Elementary|Middle|High)$/.test(name.trim())
		? `${name.trim()} School`
		: name.trim();
}

/**
 * The rankings that are not a school's. The badges under the city's name used
 * to carry "#6 in Georgia · Daves Creek Elementary School" beside the Schools
 * section that says the same thing — the repeat the owner had removed from the
 * community page (2026-11-22: "和下面的内容重复了").
 */
export function otherRankings(d: City): City["rankings"] {
	const schools = new Set(
		d.education.schools.flatMap((s) => [
			s.name.toLowerCase(),
			fullSchoolName(s.name).toLowerCase(),
		]),
	);
	return d.rankings.filter((r) => !schools.has(r.title.trim().toLowerCase()));
}

/**
 * The Schools tile: the best-ranked school at each level — elementary,
 * middle, high — the name in full and its published rank (owner 2026-11-24:
 * "schools 只显示3个小初高排名最高的"). For a day it listed every ranked school
 * (phase372, "学校应该有很多吧 只看到三个"); those, and every other school in
 * and around the city, are in the sheet the tile opens.
 */
export function schoolRows(d: City): { name: string; rank?: string }[] {
	return schoolColumns(d.education.schools)
		.columns.flatMap((c) => c.schools.slice(0, 1))
		.map((s) => ({
			name: fullSchoolName(s.name),
			...(s.rank ? { rank: [s.rank, s.scope].filter(Boolean).join(" ") } : {}),
		}));
}

const LEVEL_HEADING = {
	elementary: "Elementary",
	middle: "Middle",
	high: "High",
} as const;

/** The sheet's full list: every school in and around the city, under its level. */
export function schoolsByLevel(
	all: CityDetailDTO["allSchools"],
): { heading: string; schools: NonNullable<CityDetailDTO["allSchools"]> }[] {
	return (["elementary", "middle", "high"] as const)
		.map((level) => ({
			heading: LEVEL_HEADING[level],
			schools: (all ?? []).filter((s) => s.level === level),
		}))
		.filter((g) => g.schools.length > 0);
}

/**
 * The crime row's figure: "Well below Georgia's rate". Words only — the page
 * carries no count (owner 2026-11-24: "只定性 … 不显示具体数量").
 */
export function crimeFigure(d: Pick<City, "crime">): string | null {
	return d.crime ? `${d.crime.violent} ${d.crime.against}'s rate` : null;
}

/** How many single hazards the Safety tile names under the overall rating. */
export const TILE_HAZARDS = 3;

/** FEMA's "Relatively Low" → "Low"; "Very Low" → "Very low". The sheet keeps FEMA's words. */
export function shortRating(rating: string): string {
	const short = rating.replace(/^Relatively /, "");
	return short.charAt(0) + short.slice(1).toLowerCase();
}

/**
 * The Safety tile: the composite natural-hazard rating, then Flood — the one
 * the owner named (2026-11-24: "flood等自然因素") — then the highest-rated of
 * the rest. `hazards.rows` arrives highest first.
 */
export function hazardRows(
	d: Pick<City, "hazards">,
): { label: string; rating: string }[] {
	if (!d.hazards) return [];
	const flood = d.hazards.rows.filter((r) => r.label === "Flood");
	const rest = d.hazards.rows.filter((r) => r.label !== "Flood");
	return [
		{ label: "Natural hazards, overall", rating: d.hazards.overall },
		...[...flood, ...rest].slice(0, TILE_HAZARDS),
	].map((r) => ({ label: r.label, rating: shortRating(r.rating) }));
}

/** How many everyday kinds, and how many drives, the Convenience tile names. */
export const TILE_EVERYDAY = 4;
export const TILE_DRIVES = 2;

/**
 * The Convenience tile's everyday rows: the closest place of each kind to the
 * city's centre — "Groceries · Publix · 0.9 mi" (owner 2026-11-24: "不只是距离
 * downtown和机场的距离 要生活上的方便"). The rest of each kind is in the sheet.
 */
export function everydayRows(
	d: Pick<City, "everyday">,
): { kind: string; name: string; miles: number }[] {
	return (d.everyday ?? []).slice(0, TILE_EVERYDAY).flatMap((k) => {
		const first = k.places[0];
		return first
			? [{ kind: k.kind, name: first.name, miles: first.miles }]
			: [];
	});
}

/**
 * The drives that have a time, off-peak to rush. A label is "Downtown Atlanta
 * · 30 mi"; the miles are kept apart from the name. The tile names the first
 * `TILE_DRIVES` under the everyday places; the sheet charts them all.
 */
export function driveRows(
	d: City,
): { place: string; miles?: string; time: string }[] {
	return d.gettingAround.flatMap((r) =>
		r.minutes
			? [
					{
						...placeAndMiles(r.label),
						time:
							r.minutes.min === r.minutes.max
								? `${r.minutes.min} min`
								: `${r.minutes.min}–${r.minutes.max} min`,
					},
				]
			: [],
	);
}

function placeAndMiles(label: string): { place: string; miles?: string } {
	const m = /^(.+?) · (\d+(?:\.\d+)? mi)$/.exec(label.trim());
	return m?.[1] && m[2] ? { place: m[1], miles: m[2] } : { place: label };
}

const isHomeValue = (label: string) => /median home value/i.test(label);
const isRent = (label: string) => /^median rent$/i.test(label.trim());

/** The Cost tile: what a home is worth here, and what one rents for. */
export function costRows(
	d: City,
): { label: string; value: string; note?: string }[] {
	const rows = d.compare.rows
		.filter((r) => isHomeValue(r.label))
		.map((r) => ({
			label: r.label,
			value: r.city.display,
			note: r.takeaway,
		}));
	const rent = d.stats.find((s) => isRent(s.label));
	return rent
		? [...rows, { label: rent.label, value: rent.value, note: "a month" }]
		: rows;
}

/**
 * Which glance tile belongs to which part of the page: growth is Potential's,
 * home value and rent are Cost's, and the rest — people, income, schooling —
 * stays under At a glance. One figure, one place.
 */
export function glancePart(t: GlanceTile): "potential" | "cost" | "glance" {
	if (t.kind === "growth") return "potential";
	if (t.kind === "compare" && isHomeValue(t.label)) return "cost";
	if (t.kind === "stat" && isRent(t.label)) return "cost";
	return "glance";
}
