/**
 * The homes take (phase270) — `lib/compare/take.ts` built from the same
 * figures `buildCompareTable` shows. PURE: detail DTOs in, prose out.
 *
 * Three dimensions carry the lean, because they are the three in the table
 * with an agreed direction: all-in monthly cost (lower), price per square
 * foot (lower), nearby-school proficiency (higher). Everything else the
 * table shows — age, size, HOA — has no direction a stranger may assume, so
 * it can only ever appear here as the COUNTERWEIGHT to a lean, never as a
 * reason for one.
 *
 * A dimension only counts when at least two homes have a figure AND the gap
 * is worth a sentence — a $12/mo difference spoken out loud would be the
 * arithmetic pretending to a confidence it does not have. The thresholds
 * are stated once, below, and are deliberately coarse.
 */
import {
	type CompareTake,
	PRIORITY_PROSE,
	listJoin,
	usd,
} from "../compare/take";
import {
	type PriorityKey,
	type PriorityWeights,
	topStatedPriority,
} from "../priorities";
import { buildCost } from "./cost";
import type { ListingDetailDTO } from "./detail-dto";
import { DEFAULT_DOWN_FRACTION, parseHoaMonthlyUsd } from "./monthly";

/** A gap smaller than these is "the same, basically" and earns no opinion. */
const MONTHLY_MIN_GAP_USD = 50;
const PER_SQFT_MIN_GAP_FRACTION = 0.08;
const SCHOOL_MIN_GAP_PCT = 5;

interface Measured {
	home: ListingDetailDTO;
	monthly?: number;
	perSqft?: number;
	/** Mean % proficient over whichever school levels have a figure. */
	school?: number;
}

function measure(home: ListingDetailDTO, annualRate: number): Measured {
	const m: Measured = { home };
	if (home.price !== undefined) {
		const hoa = parseHoaMonthlyUsd(home.hoaRaw);
		m.monthly = buildCost({
			priceUsd: home.price,
			annualRate,
			downFraction: DEFAULT_DOWN_FRACTION,
			...(hoa !== undefined ? { hoaMonthlyUsd: hoa } : {}),
		}).totalUsd;
		if (home.sqft !== undefined && home.sqft > 0) {
			m.perSqft = home.price / home.sqft;
		}
	}
	const pcts = (home.schools ?? [])
		.map((s) => s.proficiencyPct)
		.filter((p): p is number => p !== undefined);
	if (pcts.length > 0) {
		m.school = pcts.reduce((a, b) => a + b, 0) / pcts.length;
	}
	return m;
}

interface Dim {
	/** How the lean names this axis: "…it wins on monthly cost and schools". */
	name: string;
	/** Which declared priority this axis serves — what personalises the lean. */
	priority: PriorityKey;
	/** Index of the winning home, when the dimension counts at all. */
	winner: number;
	/** The winner's supporting sentence, gap already worked in. */
	point: string;
}

/** The dimension's verdict, or null when it cannot carry one. */
function dim(
	name: string,
	priority: PriorityKey,
	values: (number | undefined)[],
	betterLow: boolean,
	minGap: (best: number) => number,
	point: (winner: number, runnerUp: number, gapToRunnerUp: number) => string,
): Dim | null {
	const present = values
		.map((v, i) => ({ v, i }))
		.filter((x): x is { v: number; i: number } => x.v !== undefined);
	if (present.length < 2) return null;
	const sorted = [...present].sort((a, b) =>
		betterLow ? a.v - b.v : b.v - a.v,
	);
	const best = sorted[0];
	const next = sorted[1];
	if (!best || !next) return null;
	const gap = Math.abs(next.v - best.v);
	if (gap < minGap(best.v)) return null;
	return { name, priority, winner: best.i, point: point(best.i, next.i, gap) };
}

/** The street line is how a friend would say it — never the full address. */
const street = (h: ListingDetailDTO | undefined): string => h?.address ?? "it";

/**
 * What the leaned-on home GIVES UP, from the directionless facts. At most two
 * clauses — a caveat that runs longer than the case stops reading as honesty
 * and starts reading as a second table.
 */
function tradeOff(
	homes: readonly ListingDetailDTO[],
	leader: number,
): string | undefined {
	const led = homes[leader];
	if (!led) return undefined;
	const others = homes.filter((_, i) => i !== leader);
	const parts: string[] = [];

	const newest = Math.max(
		...others.map((h) => h.yearBuilt ?? Number.NEGATIVE_INFINITY),
	);
	if (led.yearBuilt !== undefined && newest - led.yearBuilt >= 10) {
		parts.push(`it’s the older build (${led.yearBuilt} against ${newest})`);
	}

	const ledHoa = parseHoaMonthlyUsd(led.hoaRaw);
	if (
		ledHoa !== undefined &&
		ledHoa > 0 &&
		others.some((h) => parseHoaMonthlyUsd(h.hoaRaw) === undefined)
	) {
		parts.push(`it’s the one carrying an HOA (${usd(ledHoa)}/mo)`);
	}

	const biggest = Math.max(
		...others.map((h) => h.sqft ?? Number.NEGATIVE_INFINITY),
	);
	if (
		led.sqft !== undefined &&
		led.sqft > 0 &&
		biggest > 0 &&
		biggest >= led.sqft * 1.15
	) {
		parts.push(
			`it’s the smaller home (${Math.round(led.sqft).toLocaleString("en-US")} sqft against ${Math.round(biggest).toLocaleString("en-US")})`,
		);
	}

	if (parts.length === 0) return undefined;
	return `The trade: ${listJoin(parts.slice(0, 2))}.`;
}

/**
 * Assumes 2–COMPARE_MAX homes — the screen's guard is upstream.
 *
 * `annualRate` is the same live rate the table's monthly row uses, so the take
 * and the row beneath it cannot disagree. `weights` is the buyer's DECLARED
 * priorities: it reorders which axis the lean is built on and lets the take
 * quote them back to themselves. It never changes who wins an axis — the
 * arithmetic is the arithmetic, and `lib/priorities.ts` is explicit that a
 * weight orders and nothing else.
 */
export function buildHomeTake(
	homes: readonly ListingDetailDTO[],
	annualRate: number,
	weights?: PriorityWeights,
): CompareTake {
	const ms = homes.map((h) => measure(h, annualRate));

	const dims = [
		dim(
			"monthly cost",
			"cost",
			ms.map((m) => m.monthly),
			true,
			() => MONTHLY_MIN_GAP_USD,
			(w, r, gap) =>
				`All-in, ${street(homes[w])} runs about ${usd(gap)} a month less than ${street(homes[r])} — ${usd(gap * 60)} over five years.`,
		),
		dim(
			"space for the money",
			"cost",
			ms.map((m) => m.perSqft),
			true,
			(best) => best * PER_SQFT_MIN_GAP_FRACTION,
			(w, r) =>
				`${street(homes[w])} is the most house for the money — ${usd(ms[w]?.perSqft ?? 0)} a square foot against ${usd(ms[r]?.perSqft ?? 0)}.`,
		),
		dim(
			"schools",
			"schools",
			ms.map((m) => m.school),
			false,
			() => SCHOOL_MIN_GAP_PCT,
			(w, r) =>
				`The schools near ${street(homes[w])} test stronger — ${Math.round(ms[w]?.school ?? 0)}% proficient against ${Math.round(ms[r]?.school ?? 0)}%.`,
		),
	].filter((d): d is Dim => d !== null);

	// What the buyer said matters, when they said anything unambiguous. Used
	// to ORDER the case and to name them in it — never to pick a winner.
	const top = weights ? topStatedPriority(weights) : undefined;
	if (top) {
		dims.sort(
			(a, b) => Number(b.priority === top) - Number(a.priority === top),
		);
	}

	// Schools compared for some homes but silent for another: say so, rather
	// than letting the silence read as "nothing to report".
	const blindSpot =
		dims.some((d) => d.name === "schools") &&
		ms.some((m) => m.school === undefined)
			? `No school figures for ${listJoin(ms.filter((m) => m.school === undefined).map((m) => street(m.home)))} — that part of the case is blind.`
			: undefined;

	if (dims.length === 0) {
		return {
			lead: "These are closer than they look — the figures barely split them.",
			points: [],
			caveat:
				"When it’s this close, the street decides it, not the spreadsheet. Go stand in each one.",
		};
	}

	const leader = dims[0]?.winner;
	if (leader !== undefined && dims.every((d) => d.winner === leader)) {
		return {
			lead: `If it were me, I’d lean ${street(homes[leader])} — it wins on ${listJoin(dims.map((d) => d.name))}.`,
			points: [...dims.map((d) => d.point), ...(blindSpot ? [blindSpot] : [])],
			caveat:
				tradeOff(homes, leader) ??
				"That’s the arithmetic talking — go stand in it before you believe me.",
		};
	}

	// The wins split. If the buyer has told us what they weigh, that IS the
	// tie-break — quoting it back is the difference between a friend who knows
	// you and a spreadsheet that shrugs. Without a stated priority we shrug
	// honestly rather than choosing for them.
	const decisive = top ? dims.find((d) => d.priority === top) : undefined;
	if (decisive) {
		const against = dims.filter((d) => d.winner !== decisive.winner);
		return {
			lead: `You said ${PRIORITY_PROSE[decisive.priority]} matters most — so of these I’d lean ${street(homes[decisive.winner])}.`,
			points: [...dims.map((d) => d.point), ...(blindSpot ? [blindSpot] : [])],
			caveat:
				against.length > 0
					? `Be clear what that costs you: ${listJoin(against.map((d) => `${street(homes[d.winner])} wins on ${d.name}`))}. Change what matters on the You tab and I'll read it differently.`
					: tradeOff(homes, decisive.winner),
		};
	}

	const winners = new Set(dims.map((d) => d.winner));
	const alsoRans = homes
		.map((h, i) => ({ h, i }))
		.filter(({ i }) => !winners.has(i));
	return {
		lead: "Honestly, this one’s a trade, not a ranking — it depends what you weigh more.",
		points: [...dims.map((d) => d.point), ...(blindSpot ? [blindSpot] : [])],
		caveat:
			alsoRans.length > 0
				? `${listJoin(alsoRans.map(({ h }) => street(h)))} ${alsoRans.length === 1 ? "doesn’t" : "don’t"} lead on anything I can measure — if it stays on your list, it’s for something the numbers below don’t show.`
				: "Which way it tips is your weighing, not mine — the numbers are below.",
	};
}
