/**
 * The row and section shapes every compare table shares (phase281).
 *
 * phase280 gave the homes compare four aspect sections; phase281 gives the
 * same frame to communities and moves the shapes here so the two builders
 * and the one renderer (`components/compare/CompareSection.tsx`) cannot
 * drift apart. This module is the PURE layer — types only, no React.
 *
 * `meter` is the phase281 answer to the owner's "a lot of text": a bounded
 * figure (a 0–10 score, a % proficient, a rating out of 5) draws a small
 * bar under its number so columns can be READ at a glance instead of
 * compared word by word. Only bounded, agreed-direction figures get one —
 * a bar on an open-ended dollar amount would crown a winner, which the
 * compare tables deliberately never do.
 */

export interface CompareTableRow {
	label: string;
	/** One cell per column, in the caller's order. `undefined` renders "—". */
	cells: (string | undefined)[];
	/** Small print under the label. Keep it to a few words. */
	note?: string;
	/** Aligned with `cells`: bar values for a bounded figure. */
	meter?: (number | undefined)[];
	/** The meter's full-scale value (100 for %, 10 for scores, 5 for ratings). */
	meterMax?: number;
}

/** The owner's four, in his order (2026-07-30). Fixed — never reshuffled. */
export type CompareAspectKey =
	| "schools"
	| "convenience"
	| "safety"
	| "potential";

export interface CompareAspect<R extends CompareTableRow = CompareTableRow> {
	key: CompareAspectKey;
	title: string;
	/** One short line under the title — what these figures are and are not. */
	note?: string;
	/** May be empty: the renderer says "nothing on file" rather than hiding. */
	rows: R[];
}
