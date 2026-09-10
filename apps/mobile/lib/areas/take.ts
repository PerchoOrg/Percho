/**
 * The areas take (phase270) — `lib/compare/take.ts` built from the same
 * figures `buildAreaCompareTable` shows. PURE: areas in, prose out.
 *
 * Two axes carry it, not five: what the same $500k home costs to hold each
 * month, and how the schools test. They are the two the buyer study said
 * decisions actually turn on, and every other row in the table (tax,
 * utilities, insurance) is a COMPONENT of the first — leaning on both the
 * total and its parts would count one gap twice. Property tax appears here
 * only as the explanation of a cost gap, when it in fact explains it.
 *
 * Estimated inputs (water/trash) are not re-flagged in the prose — the table
 * below asterisks the exact cells and the foot says what the asterisk means,
 * and a take that hedges every clause stops sounding like anyone's friend.
 */
import {
	type Area,
	LENSES,
	type Lens,
	readingMetrics,
	taxMonthlyUsdFor,
} from "@percho/shared/lenses";
import { type CompareTake, listJoin, usd } from "../compare/take";

/** Gaps smaller than these are "the same, basically" and earn no opinion. */
const COST_MIN_GAP_USD_MONTHLY = 25;
const SCHOOL_MIN_GAP_PCT = 3;

interface Measured {
	area: Area;
	cost?: number;
	school?: number;
	taxAnnual?: number;
}

function measure(area: Area): Measured {
	const trueCost = LENSES.find((l) => l.id === "true_cost") as Lens | undefined;
	const m: Measured = { area };
	const cost = readingMetrics(area, (get) =>
		trueCost?.compute(get, area.key),
	).value;
	if (cost !== undefined) m.cost = cost;
	const school = readingMetrics(area, (get) =>
		get("school_proficiency_pct"),
	).value;
	if (school !== undefined) m.school = school;
	const taxMonthly = readingMetrics(area, (get) =>
		taxMonthlyUsdFor(area.key, get),
	).value;
	if (taxMonthly !== undefined) m.taxAnnual = taxMonthly * 12;
	return m;
}

/** Best and runner-up on one axis, or null when it cannot carry a verdict. */
function verdict(
	ms: readonly Measured[],
	value: (m: Measured) => number | undefined,
	betterLow: boolean,
	minGap: number,
): { winner: number; runnerUp: number; gap: number } | null {
	const present = ms
		.map((m, i) => ({ v: value(m), i }))
		.filter((x): x is { v: number; i: number } => x.v !== undefined);
	if (present.length < 2) return null;
	const sorted = [...present].sort((a, b) =>
		betterLow ? a.v - b.v : b.v - a.v,
	);
	const best = sorted[0];
	const next = sorted[1];
	if (!best || !next) return null;
	const gap = Math.abs(next.v - best.v);
	if (gap < minGap) return null;
	return { winner: best.i, runnerUp: next.i, gap };
}

const countyName = (a: Area | undefined): string =>
	a ? `${a.name} County` : "it";

/**
 * Assumes 2–3 areas — the screen guards the count. The cost figures are the
 * lens's own computation, so the take and the map cannot disagree.
 */
export function buildAreaTake(areas: readonly Area[]): CompareTake {
	const ms = areas.map(measure);

	const cost = verdict(ms, (m) => m.cost, true, COST_MIN_GAP_USD_MONTHLY);
	const school = verdict(ms, (m) => m.school, false, SCHOOL_MIN_GAP_PCT);

	const points: string[] = [];
	if (cost) {
		points.push(
			`The same $500k home costs about ${usd(cost.gap)} a month less to hold in ${countyName(areas[cost.winner])} than in ${countyName(areas[cost.runnerUp])} — ${usd(cost.gap * 12)} a year.`,
		);
		// Say WHY the cost differs when tax in fact carries the gap — a friend
		// explains the number, not just states it.
		const taxW = ms[cost.winner]?.taxAnnual;
		const taxR = ms[cost.runnerUp]?.taxAnnual;
		if (
			taxW !== undefined &&
			taxR !== undefined &&
			taxR - taxW >= cost.gap * 12 * 0.6
		) {
			points.push(
				`Most of that is property tax: ${usd(taxW)} a year against ${usd(taxR)}.`,
			);
		}
	}
	if (school) {
		points.push(
			`Schools in ${countyName(areas[school.winner])} test stronger — ${Math.round(ms[school.winner]?.school ?? 0)}% proficient against ${Math.round(ms[school.runnerUp]?.school ?? 0)}%.`,
		);
	}

	if (!cost && !school) {
		return {
			lead: "On these figures your areas are near twins — nothing I can point at splits them.",
			points: [],
			caveat:
				"When the numbers won’t decide it, the drive will. Do the commute from each, once, at the real hour.",
		};
	}

	if (cost && school && cost.winner !== school.winner) {
		return {
			lead: `It’s the classic trade: ${countyName(areas[cost.winner])} is the cheaper hold, ${countyName(areas[school.winner])} has the stronger schools.`,
			points,
			caveat:
				"What a school point is worth per month is your call, not mine — that’s why nothing below is marked as the overall winner.",
		};
	}

	// One area either wins both axes or wins the only axis with a verdict.
	const names = listJoin(areas.map((a) => a.name));
	if (cost && school) {
		return {
			lead: `Between ${names}, I’d lean ${countyName(areas[cost.winner])} — it’s the cheaper hold and the schools test better.`,
			points,
		};
	}
	if (cost) {
		return {
			lead: `Between ${names}, I’d lean ${countyName(areas[cost.winner])} — the same home simply costs less to keep there.`,
			points,
			caveat: ms.every((m) => m.school !== undefined)
				? "Schools don’t split them, so cost gets the last word."
				: "That’s cost talking — I don’t have school figures for all of them, so weigh that part yourself.",
		};
	}
	return {
		lead: `Between ${names}, I’d lean ${countyName(areas[school?.winner ?? 0])} — the schools carry it.`,
		points,
		caveat: "Costs don’t split them, so schools get the last word.",
	};
}
