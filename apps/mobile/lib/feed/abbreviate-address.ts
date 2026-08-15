/**
 * Street-suffix abbreviations for the listing card's address row
 * (2026-08-13 redesign: Court → Ct, Northwest → NW). Pure string transform,
 * one line, no deps.
 */
const SUFFIX: ReadonlyArray<readonly [string, string]> = [
	["Northwest", "NW"],
	["Court", "Ct"],
];

/** Abbreviate the known suffixes in a street address, in place. */
export function abbreviateAddress(address: string): string {
	let out = address;
	for (const [from, to] of SUFFIX) {
		out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
	}
	return out;
}
