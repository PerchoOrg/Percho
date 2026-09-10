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

/** "a" · "a and b" · "a, b and c" — prose, not a list. */
export function listJoin(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "$1,234" — whole dollars; a take never needs cents. */
export const usd = (v: number): string =>
	`$${Math.round(v).toLocaleString("en-US")}`;
