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
 * Below the threshold the function returns null and the card says the persona
 * is still taking shape — 05 §5.4's push rule ("persona 未成型不发") already
 * treats an under-evidenced persona as not existing, and a name invented from
 * one swipe would be the "complete your profile" energy the spec bans.
 *
 * PURE: no react / zustand / expo imports.
 */
import type { DimKey } from "@percho/shared/types";

/**
 * A dim's weight must reach this for the pairing to claim it. One trade-off
 * answer scores +1; requiring 2 means a dim was chosen at least twice (or
 * chosen twice as often as it was discarded), which is the difference between
 * a preference and a coin flip.
 */
export const DIM_NAME_THRESHOLD = 2;

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

/**
 * The persona name, or null while it is still taking shape. Needs two dims at
 * `DIM_NAME_THRESHOLD` — one strong dim is a preference, not a persona.
 */
export function personaName(
	dims: Readonly<Record<string, number>>,
): string | null {
	const ranked = rankedDims(dims).filter((d) => d.weight >= DIM_NAME_THRESHOLD);
	const first = ranked[0];
	const second = ranked[1];
	if (!first || !second) return null;
	return `${MODIFIER[first.dim]} ${ARCHETYPE[second.dim]}`;
}
