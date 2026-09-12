/**
 * The three one-liners under the persona name (phase276.5).
 *
 * They replaced "19 likes · 32 trade-offs · 12 areas" — counts that say
 * nothing about the buyer (owner, 2026-09-11: "mean what? replace them with
 * some interesting stuff … keep them short in one line"). Each line is a
 * reading of evidence the tab already holds, and each is omitted rather than
 * padded when its evidence is missing.
 *
 * PURE: no react / zustand / expo imports.
 */
import {
	DIM_LABELS,
	type PersonaDim,
	isPersonaDim,
	rankedDims,
} from "./persona";
import type { GeoSignal } from "./signals";

/** Fewer swipes than this and a like ratio is noise, not a trait. */
const MIN_SWIPES_FOR_RATIO = 3;

export function insightLines(args: {
	/** The buyer's most-explored area, if any. */
	topArea?: string;
	dims: Readonly<Record<string, number>>;
	geo: readonly GeoSignal[];
}): string[] {
	const lines: string[] = [];

	if (args.topArea) lines.push(`Most at home in ${args.topArea}`);

	const lean = rankedDims(args.dims)[0];
	if (lean) {
		// The dim the buyer has most consistently swiped AWAY from, if any —
		// "over nightlife" reads as a trait; the second-favourite would not.
		const against = Object.entries(args.dims)
			.filter((pair): pair is [PersonaDim, number] => isPersonaDim(pair[0]))
			.filter(([, w]) => w < 0)
			.sort((a, b) => a[1] - b[1])[0];
		const label = DIM_LABELS[lean.dim].toLowerCase();
		lines.push(
			against
				? `Leaning ${label} over ${DIM_LABELS[against[0]].toLowerCase()}`
				: `Leaning ${label}`,
		);
	}

	// A card can credit more than one geo level, so `right` and `left` are
	// both over-counted by the same factor — the ratio is exact.
	const right = args.geo.reduce((n, g) => n + g.right, 0);
	const total = right + args.geo.reduce((n, g) => n + g.left, 0);
	if (total >= MIN_SWIPES_FOR_RATIO && right > 0) {
		const n = Math.round(total / right);
		lines.push(
			n <= 1
				? "You like almost everything you see"
				: `You like 1 in ${n} places you see`,
		);
	}

	return lines;
}
