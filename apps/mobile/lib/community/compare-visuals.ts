/**
 * What the community side-by-side DRAWS (phase386) — the charts above the
 * table. PURE: detail DTOs in, chart rows out.
 *
 * Owner 2026-11-23: "比较页面要生动一些". The screen was a take and a table of
 * figures from before a community had a profile (phase281); since phase339
 * each one carries what its Explore page shows — school standings, a home
 * value series, distances — and none of it reached the comparison. This
 * shapes those same blocks so the places can be drawn against each other.
 *
 * The sections are the Explore page's five, in its order: Safety, Schools,
 * Convenience, Potential, Cost. Each cell is one place's own figure, printed
 * as its page prints it. Nothing is ranked and no cell is marked best — the
 * rule `community-compare.ts` argues. A place with no figure is `undefined`
 * and drawn as a dash; a section nobody has a figure for is not drawn.
 */
import type { CommunityProfile } from "@percho/shared/community-profile";
import { rankShare } from "@percho/shared/rank-share";
import type { TourSegment } from "@percho/shared/tour-buckets";
import {
	axisTop,
	closeBy,
	milesOf,
	nearbyStops,
	schoolName,
	schoolRanks,
} from "./explore";

/** The slice of a community detail the charts read. */
export interface VisualCommunity {
	profile?: CommunityProfile;
	tourSegments?: readonly TourSegment[];
}

/** One place's distance to something: how far, and what it is. */
export interface DistanceCell {
	miles: number;
	name: string;
}

/** One kind of place, and how far each compared community is from its own. */
export interface DistanceRow {
	label: string;
	/** Where the row's axis ends, in miles. */
	axisMiles: number;
	cells: (DistanceCell | undefined)[];
}

export interface SchoolCell {
	/** "Cumming Elementary School" */
	name: string;
	/** The share the page prints: 12 for "Top 12%". */
	share: number;
	/** "0.4 mi" */
	distance?: string;
}

export interface CompareVisuals {
	safety: {
		rows: DistanceRow[];
		/** "Minimal flood hazard · Zone X", one per place. */
		flood: (string | undefined)[];
	} | null;
	schools: { level: string; cells: (SchoolCell | undefined)[] }[];
	convenience: DistanceRow[];
	potential: {
		cells: ({ display: string; change: string; area: string } | undefined)[];
		/** The years every charted place has, oldest first. Empty: no chart. */
		years: number[];
		/** One line per place over `years`; undefined for a place without one. */
		series: (number[] | undefined)[];
		/** The top of the shared axis. */
		max: number;
	} | null;
	cost: {
		holding: (
			| {
					display: string;
					usd: number;
					/** What the month is made of, as the place's page lists it. */
					rows: { label: string; usd: number }[];
			  }
			| undefined
		)[];
		dues: (string | undefined)[];
	} | null;
}

const SCHOOL_LEVELS = ["Elementary", "Middle", "High"];
const FLOOD_LABEL = "Flood zone";
/**
 * Not compared (phase387, owner: "比较fire station的距离很奇怪"): every
 * neighbourhood has a station a few minutes off, and half a mile more or less
 * of it decides nothing. It stays on the community's own page.
 */
const NOT_COMPARED = new Set(["Fire station"]);

const some = <T>(cells: readonly (T | undefined)[]): boolean =>
	cells.some((c) => c !== undefined);

/** A row of distances with the axis they share. */
function distanceRow(
	label: string,
	cells: (DistanceCell | undefined)[],
): DistanceRow {
	const far = Math.max(0, ...cells.map((c) => c?.miles ?? 0));
	return { label, axisMiles: Math.max(1, Math.ceil(far)), cells };
}

function safetyOf(
	communities: readonly VisualCommunity[],
): CompareVisuals["safety"] {
	const rowsOf = (c: VisualCommunity) => c.profile?.safety?.rows ?? [];
	// Every measured kind any of them has, in the order first seen — the
	// profiles all list hospital before fire station.
	const labels: string[] = [];
	for (const c of communities) {
		for (const r of rowsOf(c)) {
			if (r.label === FLOOD_LABEL || NOT_COMPARED.has(r.label)) continue;
			if (milesOf(r.note) === null) continue;
			if (!labels.includes(r.label)) labels.push(r.label);
		}
	}
	const rows = labels.map((label) =>
		distanceRow(
			label,
			communities.map((c) => {
				const r = rowsOf(c).find((x) => x.label === label);
				const miles = milesOf(r?.note);
				return r && miles !== null ? { miles, name: r.name } : undefined;
			}),
		),
	);
	const flood = communities.map((c) => {
		const r = rowsOf(c).find((x) => x.label === FLOOD_LABEL);
		return r ? [r.name, r.note].filter(Boolean).join(" · ") : undefined;
	});
	return rows.length > 0 || some(flood) ? { rows, flood } : null;
}

function schoolsOf(
	communities: readonly VisualCommunity[],
): CompareVisuals["schools"] {
	const ranks = communities.map((c) => schoolRanks(c.profile?.ranks));
	return SCHOOL_LEVELS.map((level) => ({
		level,
		cells: ranks.map((rows): SchoolCell | undefined => {
			const r = rows.find((x) => x.label === level);
			return r
				? {
						name: schoolName(r),
						share: rankShare(r),
						...(r.distance ? { distance: r.distance } : {}),
					}
				: undefined;
		}),
	})).filter((l) => some(l.cells));
}

function convenienceOf(
	communities: readonly VisualCommunity[],
): CompareVisuals["convenience"] {
	const close = communities.map((c) => {
		const view = nearbyStops(c.tourSegments);
		return view ? closeBy(view) : [];
	});
	const groups: string[] = [];
	for (const stops of close) {
		for (const s of stops) if (!groups.includes(s.group)) groups.push(s.group);
	}
	return groups.map((group) =>
		distanceRow(
			group,
			close.map((stops) => {
				const s = stops.find((x) => x.group === group);
				return s ? { miles: s.miles, name: s.name } : undefined;
			}),
		),
	);
}

function potentialOf(
	communities: readonly VisualCommunity[],
): CompareVisuals["potential"] {
	const values = communities.map((c) => c.profile?.homeValue);
	if (!some(values)) return null;
	// The lines share an axis, so they are drawn over the years all of them
	// have — a place whose record starts later would otherwise be stretched
	// across years it has no figure for.
	const charted = values.filter((v) => v !== undefined);
	const years = (charted[0]?.series ?? [])
		.map((p) => p.year)
		.filter((y) => charted.every((v) => v.series.some((p) => p.year === y)));
	const drawn = years.length >= 2 ? years : [];
	const series = values.map((v) =>
		v && drawn.length > 0
			? drawn.map((y) => v.series.find((p) => p.year === y)?.value ?? 0)
			: undefined,
	);
	return {
		cells: values.map((v) =>
			v ? { display: v.display, change: v.change, area: v.area } : undefined,
		),
		years: drawn,
		series,
		max: axisTop(series.flatMap((s) => s ?? [])),
	};
}

function costOf(
	communities: readonly VisualCommunity[],
): CompareVisuals["cost"] {
	const holding = communities.map((c) => {
		const h = c.profile?.homeValue?.holding;
		return h
			? {
					display: h.display,
					usd: h.rows.reduce((a, r) => a + r.usd, 0),
					rows: h.rows.map((r) => ({ label: r.label, usd: r.usd })),
				}
			: undefined;
	});
	const dues = communities.map((c) => {
		const d = c.profile?.dues;
		return d ? `${d.display} ${d.period}` : undefined;
	});
	return some(holding) || some(dues) ? { holding, dues } : null;
}

export function buildCompareVisuals(
	communities: readonly VisualCommunity[],
): CompareVisuals {
	return {
		safety: safetyOf(communities),
		schools: schoolsOf(communities),
		convenience: convenienceOf(communities),
		potential: potentialOf(communities),
		cost: costOf(communities),
	};
}

/** Whether there is anything to draw above the table at all. */
export function hasVisuals(v: CompareVisuals): boolean {
	return (
		v.safety !== null ||
		v.schools.length > 0 ||
		v.convenience.length > 0 ||
		v.potential !== null ||
		v.cost !== null
	);
}

// ─── in short ───────────────────────────────────────────────────────────────

/** One plain finding: which place, and what stands out about it. */
export interface ShortLine {
	/** Index of the place the line is about. */
	place: number;
	/** "The best-ranked schools nearby — Top 5–12% in Georgia." */
	text: string;
}

/**
 * The index of the lowest value, when it is clear of the next by `minGap`.
 * Needs two places with a figure: one figure alone leads nothing.
 */
function lowest(
	values: readonly (number | undefined)[],
	minGap: number,
): number | null {
	const known = values
		.map((v, i) => ({ v, i }))
		.filter((x): x is { v: number; i: number } => x.v !== undefined)
		.sort((a, b) => a.v - b.v);
	const [first, second] = known;
	if (!first || !second || second.v - first.v < minGap) return null;
	return first.i;
}

/** "$747K" → 747000, "$1.2M" → 1200000. */
function usdOf(display: string): number | undefined {
	const m = display.match(/\$([\d.]+)\s*([KM])/i);
	if (!m?.[1]) return undefined;
	return Number(m[1]) * (m[2]?.toUpperCase() === "M" ? 1_000_000 : 1000);
}

/**
 * What the cards below say, in a few plain lines (phase388).
 *
 * The comparison used to open on the phase270 take, written from the old
 * table — "40 fitness to Windward's 1", owner-occupancy. Owner 2026-11-24, on
 * the phone: "percho take 没看懂". This replaces it wherever the places have
 * profiles: one line per direction, naming the place that stands out and the
 * figure that says so, each readable in the card of the same name underneath.
 *
 * A line is only written when the gap is real (the thresholds below) and the
 * direction is one nobody argues with — better-ranked, nearer, cheaper. It is
 * not a verdict: no line weighs schools against cost, and a set of places
 * with no clear gaps gets no lines.
 */
export function buildInShort(v: CompareVisuals): ShortLine[] {
	const lines: ShortLine[] = [];

	// Schools: the mean share over the levels a place has, at least 5 points
	// clear of the next place.
	const count = v.schools[0]?.cells.length ?? 0;
	const shares = Array.from({ length: count }, (_, i) =>
		v.schools.flatMap((l) => {
			const c = l.cells[i];
			return c ? [c.share] : [];
		}),
	);
	const school = lowest(
		shares.map((s) =>
			s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : undefined,
		),
		5,
	);
	const best = school !== null ? shares[school] : undefined;
	if (school !== null && best) {
		const lo = Math.min(...best);
		const hi = Math.max(...best);
		lines.push({
			place: school,
			text: `The best-ranked schools nearby — Top ${lo === hi ? lo : `${lo}–${hi}`}% in Georgia.`,
		});
	}

	const nearest = (
		row: DistanceRow | undefined,
		minGap: number,
		say: string,
	) => {
		const i = row
			? lowest(
					row.cells.map((c) => c?.miles),
					minGap,
				)
			: null;
		const c = i !== null ? row?.cells[i] : undefined;
		if (i !== null && c)
			lines.push({ place: i, text: `${say} — ${c.miles} mi.` });
	};
	nearest(
		v.convenience.find((r) => r.label === "Errands"),
		0.5,
		"The shortest trip for groceries",
	);
	nearest(
		v.safety?.rows.find((r) => r.label === "Hospital"),
		1,
		"The shortest drive to a hospital",
	);

	// Home value: the newest point of the charted line, else the printed
	// figure. 5% apart or it is the same price.
	const values = (v.potential?.cells ?? []).map((c, i) => {
		const line = v.potential?.series[i];
		return line?.[line.length - 1] ?? (c ? usdOf(c.display) : undefined);
	});
	const cheapest = lowest(values, 0);
	const price = cheapest !== null ? values[cheapest] : undefined;
	if (
		cheapest !== null &&
		price !== undefined &&
		lowest(values, price * 0.05) === cheapest
	) {
		lines.push({
			place: cheapest,
			text: `The lowest home values — around ${v.potential?.cells[cheapest]?.display}.`,
		});
	}

	const hold = lowest(
		(v.cost?.holding ?? []).map((h) => h?.usd),
		50,
	);
	if (hold !== null) {
		lines.push({
			place: hold,
			text: `The least to hold a home — ${v.cost?.holding[hold]?.display} a month before the mortgage.`,
		});
	}

	return lines;
}

/** The flood zone in one line when every place has the same one, else null. */
export function sharedFlood(
	flood: readonly (string | undefined)[],
): string | null {
	const first = flood[0];
	return first !== undefined && flood.every((f) => f === first) ? first : null;
}
