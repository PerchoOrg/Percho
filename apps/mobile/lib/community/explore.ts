/**
 * Shaping for the community explore page's tiles and sheets (phase339).
 *
 * Pure: the components in `components/community/Explore*.tsx` only draw what
 * these return. The page is one screen of findings (owner 2026-11-15: "太长了
 * 没人会看这么多"), so most of what is here decides what is worth a tile — a
 * tile with nothing behind it is not drawn.
 */
import type {
	CommunityProfile,
	CommunityRank,
} from "@percho/shared/community-profile";
import type { TourSegment } from "@percho/shared/tour-buckets";

// ─── nearby: the film's own stops, by distance ──────────────────────────────

/** A stop counts as near inside this many miles. */
export const NEAR_MILES = 3;
/** Fewer stops than this is an anecdote, not a finding. */
const MIN_STOPS = 4;

/**
 * `intent_bucket` → the row a stop is drawn on. Five rows, not sixteen: the
 * strip answers "how far is the kind of thing I do every week".
 */
const STOP_GROUPS: Record<string, string> = {
	daily_errands: "Errands",
	shopping: "Errands",
	dining: "Food & drink",
	nightlife: "Food & drink",
	outdoor: "Outdoors",
	waterfront: "Outdoors",
	pets: "Outdoors",
	fitness: "Outdoors",
	schools: "Schools",
};
const GROUP_ORDER = ["Errands", "Food & drink", "Outdoors", "Schools", "More"];

export interface NearbyStop {
	name: string;
	miles: number;
	group: string;
}

export interface NearbyView {
	stops: NearbyStop[];
	/** How many of `stops` are within `NEAR_MILES`. */
	near: number;
	/** The strip's rows, in a fixed order, empty rows dropped. */
	rows: { group: string; stops: NearbyStop[] }[];
	/** Where the axis ends, in whole miles. */
	axisMiles: number;
}

/** The miles in a segment's distance label ("1.4 mi"), or null. */
export function milesOf(distance?: string): number | null {
	const m = distance?.match(/^(\d+(?:\.\d+)?)\s*mi$/);
	return m?.[1] ? Number(m[1]) : null;
}

/**
 * The film's stops outside the community, each once, with how far it is.
 *
 * The community's own amenities ("0 mi") are not stops — the question is how
 * far everything ELSE is. Null when the film names too few places with a
 * distance to say anything.
 */
export function nearbyStops(
	segments: readonly TourSegment[] | undefined,
): NearbyView | null {
	const seen = new Set<string>();
	const stops: NearbyStop[] = [];
	for (const s of segments ?? []) {
		const miles = milesOf(s.distance);
		if (miles === null || miles <= 0 || s.bucket === "amenities") continue;
		if (seen.has(s.name)) continue;
		seen.add(s.name);
		stops.push({
			name: s.name,
			miles,
			group: STOP_GROUPS[s.bucket ?? ""] ?? "More",
		});
	}
	if (stops.length < MIN_STOPS) return null;
	stops.sort((a, b) => a.miles - b.miles);
	return {
		stops,
		near: stops.filter((s) => s.miles <= NEAR_MILES).length,
		rows: GROUP_ORDER.map((group) => ({
			group,
			stops: stops.filter((s) => s.group === group),
		})).filter((r) => r.stops.length > 0),
		axisMiles: Math.max(5, Math.ceil(stops[stops.length - 1]?.miles ?? 0)),
	};
}

// ─── ranks ──────────────────────────────────────────────────────────────────

/** The rows the page's tile shows: the first four that name a tile rank. */
export function tileRanks(
	ranks: CommunityProfile["ranks"],
): (CommunityRank & { tile: string })[] {
	return (ranks?.rows ?? [])
		.filter((r): r is CommunityRank & { tile: string } => !!r.tile)
		.slice(0, 4);
}

/** Rows under their group heading, in the order the profile lists them. */
export function rankGroups(
	rows: readonly CommunityRank[],
): { group: string; rows: CommunityRank[] }[] {
	const groups: { group: string; rows: CommunityRank[] }[] = [];
	for (const row of rows) {
		const last = groups[groups.length - 1];
		if (last && last.group === row.group) last.rows.push(row);
		else groups.push({ group: row.group, rows: [row] });
	}
	return groups;
}

/** A dot's place on its track, kept off the ends so it is drawn whole. */
export function dotAt(percentile: number): `${number}%` {
	return `${Math.min(97, Math.max(3, percentile))}%`;
}

// ─── events ─────────────────────────────────────────────────────────────────

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface EventView {
	key: string;
	/** "Sat Nov 21" · "From Dec 4" · "To Jan 18" */
	when: string;
	month: string;
	day: string;
	title: string;
	where: string;
	url?: string;
}

/** The device's own calendar day, YYYY-MM-DD. */
export function localDay(now: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function parts(day: string) {
	const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
	// UTC on both sides, so the weekday never depends on the phone's zone.
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return { month: MONTHS[m - 1] ?? "", day: String(d), weekday };
}

/**
 * What is still ahead, soonest first.
 *
 * A dated list goes stale on its own; the page drops what has passed rather
 * than trust the profile to be rewritten in time. Something that runs for
 * weeks says when it starts until it has started, then when it ends.
 */
export function upcomingEvents(
	events: CommunityProfile["events"],
	today: string,
): EventView[] {
	return (events ?? [])
		.filter((e) => (e.until ?? e.date) >= today)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((e) => {
			const running = e.until && e.date <= today;
			const shown = parts(running && e.until ? e.until : e.date);
			const on = `${shown.month} ${shown.day}`;
			return {
				key: `${e.date}-${e.title}`,
				when: running
					? `To ${on}`
					: e.until
						? `From ${on}`
						: `${DAYS[shown.weekday]} ${on}`,
				month: shown.month,
				day: shown.day,
				title: e.title,
				where: e.where,
				...(e.url ? { url: e.url } : {}),
			};
		});
}

// ─── lines ──────────────────────────────────────────────────────────────────

/** One straight piece of a line chart, as a rotated bar can draw it. */
export interface Stroke {
	/** Centre of the piece. */
	cx: number;
	cy: number;
	length: number;
	/** Radians, clockwise — what `rotate` takes. */
	angle: number;
}

/** Where value `i` of a series sits in a `width` × `height` box whose top is `max`. */
export function pointAt(
	values: readonly number[],
	i: number,
	width: number,
	height: number,
	max: number,
): { x: number; y: number } {
	const x = values.length > 1 ? (i / (values.length - 1)) * width : 0;
	const y = height - ((values[i] ?? 0) / (max || 1)) * height;
	return { x, y };
}

/**
 * A series as the straight pieces between its points.
 *
 * The app ships no SVG library, so a line is drawn as thin Views, each rotated
 * to join two points.
 */
export function strokes(
	values: readonly number[],
	width: number,
	height: number,
	max: number,
): Stroke[] {
	const out: Stroke[] = [];
	for (let i = 0; i < values.length - 1; i++) {
		const a = pointAt(values, i, width, height, max);
		const b = pointAt(values, i + 1, width, height, max);
		out.push({
			cx: (a.x + b.x) / 2,
			cy: (a.y + b.y) / 2,
			length: Math.hypot(b.x - a.x, b.y - a.y),
			angle: Math.atan2(b.y - a.y, b.x - a.x),
		});
	}
	return out;
}

/** The top of a money axis: the next round step above the largest value. */
export function axisTop(values: readonly number[]): number {
	const max = Math.max(...values, 1);
	const step = 10 ** Math.floor(Math.log10(max));
	return Math.ceil(max / step) * step;
}

/** "$747K", "$1.2M" */
export function usdShort(value: number): string {
	if (value >= 1_000_000)
		return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	return `$${Math.round(value / 1000)}K`;
}
