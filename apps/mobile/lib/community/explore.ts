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
		rows: GROUP_ORDER.map((group) => ({
			group,
			stops: stops.filter((s) => s.group === group),
		})).filter((r) => r.stops.length > 0),
		axisMiles: Math.max(5, Math.ceil(stops[stops.length - 1]?.miles ?? 0)),
	};
}

/**
 * The Nearby tile's rows: one place of each kind with its distance, the
 * closest the film visits — "Errands · Costco Wholesale · 0.8 mi".
 *
 * The tile used to print "15 of 15" over "stops within 3 miles", a count of
 * the film's own stops that told the owner nothing (2026-11-22: "nearby 15 of
 * 15是啥意思 太confuse了"). A named place and how far it is reads on its own.
 * Schools have their own tile and "More" is not a kind, so both are left to
 * the sheet unless nothing else was filmed.
 */
export function closeBy(
	view: NearbyView,
): { group: string; name: string; miles: number }[] {
	const kinds = view.rows.filter(
		(r) => r.group !== "Schools" && r.group !== "More",
	);
	return (kinds.length > 0 ? kinds : view.rows).flatMap((r) => {
		// `stops` is sorted by distance, and a row keeps that order.
		const first = r.stops[0];
		return first
			? [{ group: r.group, name: first.name, miles: first.miles }]
			: [];
	});
}

// ─── resources ──────────────────────────────────────────────────────────────

type ProfileLink = NonNullable<CommunityProfile["links"]>[number];

const LINK_GROUPS = ["Community", "Homes", "Schools", "Safety", "City"];

/**
 * The page's links under their headings, in a fixed order. A link stored
 * before the builder wrote headings (phase370), or a researched one, has none
 * and sits with the community's own pages.
 */
export function linkGroups(
	links: readonly ProfileLink[] | undefined,
	/** The city page leads with the city's own pages. */
	order: readonly string[] = LINK_GROUPS,
): { group: string; links: ProfileLink[] }[] {
	const of = (l: ProfileLink) => l.group ?? "Community";
	const named = new Set(order);
	const extra = [...new Set((links ?? []).map(of))].filter(
		(g) => !named.has(g),
	);
	return [...order, ...extra]
		.map((group) => ({
			group,
			links: (links ?? []).filter((l) => of(l) === group),
		}))
		.filter((g) => g.links.length > 0);
}

/** A link whose page lives on someone else's host wears its owner's mark. */
const LOGO_HOST: Record<string, string> = {
	"hazards-fema.maps.arcgis.com": "fema.gov",
};

/**
 * The site's own icon for a link, so a row of links reads by logo before it
 * reads by word (owner 2026-11-22: "链接最好用logo和文字 更醒目"). Google's
 * favicon service, by host — no logo is bundled with the app.
 */
export function logoFor(url: string): string | null {
	const host = url.match(/^https:\/\/([^/?#]+)/)?.[1];
	if (!host) return null;
	const domain = (LOGO_HOST[host] ?? host).replace(/^www\./, "");
	return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

// ─── ranks ──────────────────────────────────────────────────────────────────

/** The groups a profile files its school rows and its price rows under. */
const SCHOOLS_GROUP = "Schools";
const HOMES_GROUP = "Homes";

/**
 * The schools tile's rows — one a level, three at most.
 *
 * Schools and prices used to share one "Where it ranks" tile, four ranks in a
 * row. Owner 2026-11-22: "school和price分开吧" — a school's standing and a
 * home's price answer different questions, so each is drawn with its own.
 */
export function schoolRanks(ranks: CommunityProfile["ranks"]): CommunityRank[] {
	return (ranks?.rows ?? [])
		.filter((r) => r.group === SCHOOLS_GROUP)
		.slice(0, 3);
}

/** Where the home value stands among its peers — drawn on the home value sheet. */
export function homeRanks(ranks: CommunityProfile["ranks"]): CommunityRank[] {
	return (ranks?.rows ?? []).filter((r) => r.group === HOMES_GROUP);
}

/** Whatever else a profile ranks (a community's size), still under its own heading. */
export function otherRanks(ranks: CommunityProfile["ranks"]): CommunityRank[] {
	return (ranks?.rows ?? []).filter(
		(r) => r.group !== SCHOOLS_GROUP && r.group !== HOMES_GROUP,
	);
}

const LEVELS = new Set(["Elementary", "Middle", "High"]);
/** A note that already says what kind of school it is. */
const NAMES_ITS_KIND =
	/\b(school|academy|elementary|middle|high|primary|charter|magnet|institute|ES|MS|HS)\b/i;

/**
 * A school row's full name on one line: "Cumming Elementary School".
 *
 * The stored row keeps the name short and the level apart ("Cumming" /
 * "Elementary" — `shortSchool` in `profile-build.ts` strips the ending), which
 * the tile printed on two lines per school. Owner 2026-11-22: "schools 太多行了
 * 学校名字用全称在一行里". This puts the ending back, and only that ending: a
 * name that already says its kind ("Matt Elementary", "Alpharetta HS",
 * "Alliance Academy") is left alone, and a note that is a remark rather than
 * a name ("two serve it") follows the level instead of being dressed as one.
 */
export function schoolName(row: Pick<CommunityRank, "label" | "note">): string {
	const note = row.note?.trim();
	if (!note) return row.label;
	if (/^[a-z]/.test(note)) return `${row.label} · ${note}`;
	if (NAMES_ITS_KIND.test(note) || !LEVELS.has(row.label)) return note;
	return `${note} ${row.label} School`;
}

const firstCount = (text: string): number | null => {
	const m = text.match(/\d[\d,]*/);
	return m ? Number(m[0].replace(/,/g, "")) : null;
};

/**
 * A rank someone can read: "Top 38%".
 *
 * The tile used to print "#452" over "of 1,220 in GA", which leaves the
 * division to the reader (owner 2026-11-22: "看了数字跟没看一样"). This does it.
 * From the rank and the count when both read as numbers — the worse of two
 * when a row is two schools ("#3 · #6") — rounded UP, so the claim is never
 * better than the rank; otherwise from the share ranked below.
 */
export function topShare(
	row: Pick<CommunityRank, "rank" | "of" | "percentile">,
): string {
	const places = (row.rank.match(/\d[\d,]*/g) ?? []).map((n) =>
		Number(n.replace(/,/g, "")),
	);
	const of = firstCount(row.of);
	const share =
		places.length > 0 && of && of > 0
			? Math.ceil((Math.max(...places) / of) * 100)
			: Math.round(100 - row.percentile);
	return `Top ${Math.min(100, Math.max(1, share))}%`;
}

/**
 * The newest home value against its baseline's: "56% above Metro Atlanta".
 *
 * The price's own comparison — the tile draws both lines and never said how
 * far apart they are. Null when there is nothing to compare.
 */
export function againstBaseline(
	homeValue: NonNullable<CommunityProfile["homeValue"]>,
): string | null {
	const last = homeValue.series[homeValue.series.length - 1];
	if (!last || !(last.baseline > 0) || !homeValue.baseline) return null;
	const pct = Math.round((last.value / last.baseline - 1) * 100);
	if (Math.abs(pct) < 3) return `In line with ${homeValue.baseline}`;
	return `${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} ${homeValue.baseline}`;
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

/** Pieces per gap between two points — short enough that the turns don't show. */
export const CURVE_STEPS = 10;

/**
 * Tangents for a monotone cubic through evenly spaced values (Fritsch–Carlson).
 * Monotone so the curve never swings above a peak or below a dip between two
 * points: a home value that only rose must not be drawn dipping.
 */
export function monotoneSlopes(ys: readonly number[]): number[] {
	const n = ys.length;
	const d = ys.slice(1).map((y, i) => y - (ys[i] ?? 0));
	const m = ys.map((_, i) => {
		if (i === 0) return d[0] ?? 0;
		if (i === n - 1) return d[n - 2] ?? 0;
		const a = d[i - 1] ?? 0;
		const b = d[i] ?? 0;
		return a * b <= 0 ? 0 : (a + b) / 2;
	});
	for (let i = 0; i < n - 1; i++) {
		const di = d[i] ?? 0;
		if (di === 0) {
			m[i] = 0;
			m[i + 1] = 0;
			continue;
		}
		const a = (m[i] ?? 0) / di;
		const b = (m[i + 1] ?? 0) / di;
		const s = a * a + b * b;
		if (s > 9) {
			const t = 3 / Math.sqrt(s);
			m[i] = t * a * di;
			m[i + 1] = t * b * di;
		}
	}
	return m;
}

/**
 * A series as short pieces along a smooth curve through its points.
 *
 * The app ships no SVG library, so a line is drawn as thin Views, each rotated
 * to join two samples. Straight pieces point to point drew visible corners
 * (owner 2026-11-21: "画的线不平滑 不好看"); CURVE_STEPS pieces per gap do not.
 */
export function strokes(
	values: readonly number[],
	width: number,
	height: number,
	max: number,
): Stroke[] {
	if (values.length < 2) return [];
	const pts = values.map((_, i) => pointAt(values, i, width, height, max));
	const ys = pts.map((p) => p.y);
	const m = monotoneSlopes(ys);
	const samples: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i] as { x: number; y: number };
		const b = pts[i + 1] as { x: number; y: number };
		for (let k = i === 0 ? 0 : 1; k <= CURVE_STEPS; k++) {
			const t = k / CURVE_STEPS;
			const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
			const h10 = t ** 3 - 2 * t ** 2 + t;
			const h01 = -2 * t ** 3 + 3 * t ** 2;
			const h11 = t ** 3 - t ** 2;
			samples.push({
				x: a.x + (b.x - a.x) * t,
				y: h00 * a.y + h10 * (m[i] ?? 0) + h01 * b.y + h11 * (m[i + 1] ?? 0),
			});
		}
	}
	const out: Stroke[] = [];
	for (let i = 0; i < samples.length - 1; i++) {
		const a = samples[i] as { x: number; y: number };
		const b = samples[i + 1] as { x: number; y: number };
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
