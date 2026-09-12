/**
 * Persona naming (spec-v3 05 §5.3) — the You tab's "YOUR PERSONA" card.
 *
 * A deterministic lexicon, not a model call (owner 2026-08-23, on the two
 * options): the buyer's two strongest preference dims pick a modifier and an
 * archetype from hand-written tables. Zero cost, zero latency, and the whole
 * output space is reviewable — every possible name is one of 110 pairings of
 * the strings below.
 *
 * The spec's own example, "Trail-Runner Suburbanite", is what
 * `trails` + `family` produces here.
 *
 * The card always carries a name (owner, 2026-09-11: 「Don't show no profile
 * yet, anything works」 — the earlier "Still taking shape" placeholder read as
 * a broken state, not a stage). Any positive weight claims a dim; with one dim
 * the noun is the neutral `STARTER_NOUN`, with none the name is
 * `STARTER_NAME`. So the output space is 110 pairings + 11 singles + 1.
 *
 * PURE: no react / zustand / expo imports.
 */
import type { DimKey } from "@percho/shared/types";

/** The name before any dim has a positive weight. */
export const STARTER_NAME = "Curious Buyer";
/** The noun while only one dim has a positive weight. */
const STARTER_NOUN = "Buyer";

/** The strongest dim, as the name's leading modifier. */
const MODIFIER: Record<DimKey, string> = {
	outdoors: "Open-Air",
	walkable: "Sidewalk-First",
	schools: "School-District",
	quiet: "Quiet-Street",
	hip: "New-Wave",
	entertaining: "Open-House",
	trails: "Trail-Runner",
	nightlife: "Late-Night",
	family: "Family-First",
	move_in: "Turnkey",
	space: "Wide-Lot",
};

/** The second dim, as the name's archetype noun. */
const ARCHETYPE: Record<DimKey, string> = {
	outdoors: "Naturalist",
	walkable: "Urbanist",
	schools: "Planner",
	quiet: "Homebody",
	hip: "Trendsetter",
	entertaining: "Host",
	trails: "Explorer",
	nightlife: "Night Owl",
	family: "Suburbanite",
	move_in: "Pragmatist",
	space: "Homesteader",
};

/** Human labels for the evidence list ("WHAT PERCHO KNOWS"). */
export const DIM_LABELS: Record<DimKey, string> = {
	outdoors: "Outdoor living",
	walkable: "Walkable streets",
	schools: "Good schools",
	quiet: "Quiet streets",
	hip: "Up-and-coming areas",
	entertaining: "Space to entertain",
	trails: "Trail access",
	nightlife: "Nightlife nearby",
	family: "Family-friendly",
	move_in: "Move-in ready",
	space: "Room to grow",
};

function isDimKey(key: string): key is DimKey {
	return key in MODIFIER;
}

/**
 * Positive dims strongest-first. Ties break alphabetically so the name is
 * stable across renders — a persona that flickers between two names on equal
 * evidence reads as a bug, not a personality.
 */
export function rankedDims(
	dims: Readonly<Record<string, number>>,
): { dim: DimKey; weight: number }[] {
	return Object.entries(dims)
		.filter(
			(pair): pair is [DimKey, number] => isDimKey(pair[0]) && pair[1] > 0,
		)
		.map(([dim, weight]) => ({ dim, weight }))
		.sort((a, b) => b.weight - a.weight || a.dim.localeCompare(b.dim));
}

/** The persona name — never empty, see the header. */
export function personaName(dims: Readonly<Record<string, number>>): string {
	const ranked = rankedDims(dims);
	const first = ranked[0];
	const second = ranked[1];
	if (!first) return STARTER_NAME;
	return `${MODIFIER[first.dim]} ${second ? ARCHETYPE[second.dim] : STARTER_NOUN}`;
}
