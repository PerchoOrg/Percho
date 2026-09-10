/**
 * The "take" (phase270) — what a compare screen now LEADS with.
 *
 * Owner: a comparison's result "should not be the traditional way, it should
 * look like a real suggestion from a friend or agent", with the facts below
 * to support the point. So each compare screen computes one of these from
 * EXACTLY the figures its table already shows — same inputs, no model, no
 * server call — and renders it above the table.
 *
 * The trust rule this repo has held since phase D ("no composite score, no
 * winner column") moves rather than dies: the TABLES still rank nothing.
 * The opinion now exists, but it is labelled as an opinion, states its
 * reasons in numbers the buyer can check two inches lower, and names what
 * the lean gives up. A friend who just says "buy A" is not being honest;
 * one who says why, and what A costs you, is.
 *
 * Builders live with their data (`lib/listing/take.ts`, `lib/areas/take.ts`,
 * `lib/community/take.ts`); this module is only the shape they share and the
 * prose helpers they all need.
 */

export interface CompareTake {
	/** The opening — a lean, or an honest "this is a trade", spoken plainly. */
	lead: string;
	/** Supporting observations, one short sentence each. Rendered as lines. */
	points: string[];
	/** The counterweight — what the lean gives up, or what we cannot know. */
	caveat?: string;
}

/**
 * How a priority is named INSIDE a sentence (phase273).
 *
 * `PRIORITIES[].label` is chrome — title case, sized for a settings row
 * ("What it really costs"). Dropped mid-sentence it reads as a quotation from
 * a form. These are the same four things said the way a person says them.
 */
export const PRIORITY_PROSE = {
	schools: "schools",
	cost: "what it really costs",
	commute: "getting around",
	community: "the community itself",
} as const;

/**
 * How many table rows a compare screen shows before "Show all figures".
 *
 * Owner, phase273: "reduce the numbers part it is not very useful." The rows
 * are ordered by the buyer's declared priorities first, so the four that
 * survive are the four they said they cared about — truncation and
 * personalisation are the same mechanism, not two.
 */
export const ESSENTIAL_ROWS = 4;

/** Below this the expander is noise: one hidden row is not worth a control. */
export const MIN_HIDDEN_TO_EXPAND = 2;

/**
 * Which rows a compare screen draws, and whether it owes the buyer a toggle.
 *
 * The two constants above interact in a way that bit me: truncating at 4 while
 * only showing the expander for 2+ hidden rows means a 5-row table hides its
 * fifth row FOREVER, with no control to reveal it. So the decision is made
 * once, here — a table is either collapsible (and gets a toggle) or it is
 * shown whole. There is no state in which a figure exists and is unreachable.
 */
export function splitRows<T>(
	rows: readonly T[],
	showAll: boolean,
): { shown: T[]; collapsible: boolean } {
	const collapsible = rows.length - ESSENTIAL_ROWS >= MIN_HIDDEN_TO_EXPAND;
	return {
		shown: showAll || !collapsible ? [...rows] : rows.slice(0, ESSENTIAL_ROWS),
		collapsible,
	};
}

/** "a" · "a and b" · "a, b and c" — prose, not a list. */
export function listJoin(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "$1,234" — whole dollars; a take never needs cents. */
export const usd = (v: number): string =>
	`$${Math.round(v).toLocaleString("en-US")}`;
