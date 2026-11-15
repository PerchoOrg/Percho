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
