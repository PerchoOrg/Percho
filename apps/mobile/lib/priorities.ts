import { DEFAULT_LENS, type LensId } from "@percho/shared/lenses";

/**
 * What the buyer SAYS matters to them.
 *
 * ── Why this exists beside "What Percho knows" ─────────────────────────────
 *
 * The You tab already shows dimensions the app INFERRED from swipes and
 * trade-off answers (`lib/feed/signals.ts`). Those are evidence, and they are
 * honest about being evidence — the section is called what Percho knows, and
 * every row can be corrected.
 *
 * They are also slow. A buyer who has answered three trade-offs has told us
 * almost nothing, and the 2026-09 study's respondents arrived with a very
 * clear idea of what they cared about before they had used anything: schools
 * (8 of 10 look it up first), safety (7), the community's own amenities (6),
 * price and hidden cost. Making them wait to be inferred is making them wait
 * for a conclusion they could simply have stated.
 *
 * So this is the DECLARED half, kept deliberately separate from the inferred
 * half rather than merged into one number. Merging them would mean the app
 * could quietly overrule what someone told it, which is the specific failure
 * the study's respondents were worried about — 8 of 10 named "fear of
 * commercial bias" as what would stop them trusting a tool like this.
 *
 * ── Why the weights are 0–3 and not a slider ───────────────────────────────
 *
 * Four steps a person can name: not at all, a little, a lot, this is the whole
 * reason. A continuous slider invites a precision nobody has about their own
 * preferences, and produces a number we would then have to pretend to honour.
 *
 * ── What a weight is allowed to do ─────────────────────────────────────────
 *
 * It ORDERS things — which comparison row comes first, what a summary leads
 * with. It does not filter, it does not score an area, and it never hides one.
 * That restraint is the same one the lens map is under: the buyer's stated
 * priorities change what they see FIRST, never what exists.
 */

/** The four the study's answers actually cluster into. */
export type PriorityKey = "schools" | "cost" | "commute" | "community";

export interface Priority {
	key: PriorityKey;
	label: string;
	/** One line: what picking this changes. */
	blurb: string;
}

export const PRIORITIES: readonly Priority[] = [
	{
		key: "schools",
		label: "Schools",
		blurb: "District test scores and the zones a home is assigned to",
	},
	{
		key: "cost",
		label: "What it really costs",
		blurb: "Tax, utilities, trash and HOA — the monthly total, not the price",
	},
	{
		key: "commute",
		label: "Getting around",
		blurb: "How far the daily errands and the drive to work actually are",
	},
	{
		key: "community",
		label: "The community itself",
		blurb: "Amenities, who your neighbours are, what residents say",
	},
] as const;

export const MAX_WEIGHT = 3;

/** Weight → what the buyer is saying. Index is the weight. */
export const WEIGHT_LABELS: readonly string[] = [
	"Not really",
	"A little",
	"A lot",
	"It's the whole reason",
] as const;

export type PriorityWeights = Record<PriorityKey, number>;

/**
 * Everything at 1 to start: "a little", i.e. no claim either way.
 *
 * Not 0. Zeroes would mean the app opens believing the buyer cares about
 * nothing, and the first thing they did would read as a change of mind rather
 * than as their first statement.
 */
export function defaultWeights(): PriorityWeights {
	return { schools: 1, cost: 1, commute: 1, community: 1 };
}

/** Clamps to 0…MAX_WEIGHT, and drops keys we no longer recognise. */
export function normalizeWeights(raw: unknown): PriorityWeights {
	const out = defaultWeights();
	if (!raw || typeof raw !== "object") return out;
	const o = raw as Record<string, unknown>;
	for (const p of PRIORITIES) {
		const v = o[p.key];
		if (typeof v !== "number" || !Number.isFinite(v)) continue;
		out[p.key] = Math.max(0, Math.min(MAX_WEIGHT, Math.round(v)));
	}
	return out;
}

/** True once the buyer has moved anything off the neutral default. */
export function hasStated(weights: PriorityWeights): boolean {
	return PRIORITIES.some((p) => weights[p.key] !== 1);
}

/**
 * Priorities highest first. Ties keep `PRIORITIES` order, so a buyer who has
 * said nothing gets the study's own ranking (schools first) rather than an
 * arbitrary one, and the list never reshuffles under their thumb.
 */
export function rankedPriorities(weights: PriorityWeights): Priority[] {
	return PRIORITIES.map((p, i) => ({ p, i }))
		.sort((a, b) => weights[b.p.key] - weights[a.p.key] || a.i - b.i)
		.map(({ p }) => p);
}

/**
 * Reorders comparison rows to lead with what the buyer said matters.
 *
 * `rowPriority` maps a row label to the priority it serves; a row that serves
 * none keeps its position relative to the others rather than being sunk, so
 * the table stays complete and recognisable. Stable by construction: equal
 * weights preserve the caller's order.
 */
export function orderByPriority<T>(
	rows: readonly T[],
	weights: PriorityWeights,
	rowPriority: (row: T) => PriorityKey | undefined,
): T[] {
	return rows
		.map((row, i) => {
			const key = rowPriority(row);
			return { row, i, weight: key ? weights[key] : 1 };
		})
		.sort((a, b) => b.weight - a.weight || a.i - b.i)
		.map(({ row }) => row);
}

/**
 * Which lens the map should open on, given what the buyer said matters.
 *
 * The You tab asks a buyer to rank what they care about, and until now that
 * answer moved exactly one thing: the row order of a comparison screen they
 * may never reach. The map — the surface the whole feature is — opened on the
 * same default for everyone. Someone who has just said "schools matter most"
 * and is then shown a cost map has been asked a question for nothing.
 *
 * Two priorities have no lens. There is no commute lens and no community lens,
 * so rather than pretend, this walks the ranked list and takes the first
 * priority we can actually draw. A buyer who ranks commute first and schools
 * second opens on schools, which is the closest honest answer to what they
 * asked for.
 *
 * A buyer who has stated nothing gets `DEFAULT_LENS`. This only chooses what
 * the map OPENS on; tapping a chip is the buyer changing their mind about this
 * moment, and that wins.
 */
/** What `defaultWeights` gives every priority: said nothing either way. */
const NEUTRAL_WEIGHT = 1;

const LENS_FOR_PRIORITY: Partial<Record<PriorityKey, LensId>> = {
	schools: "schools",
	cost: "true_cost",
};

export function lensForPriorities(weights: PriorityWeights): LensId {
	if (!hasStated(weights)) return DEFAULT_LENS;
	for (const p of rankedPriorities(weights)) {
		// Only what they RAISED. Walking the whole ranked list means a buyer who
		// lifted commute and community — neither of which we can draw — opens on
		// a schools map they left at neutral, which is us answering for them.
		if (weights[p.key] <= NEUTRAL_WEIGHT) break;
		const lens = LENS_FOR_PRIORITY[p.key];
		if (lens) return lens;
	}
	return DEFAULT_LENS;
}
