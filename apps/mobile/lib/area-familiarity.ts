/**
 * Area Familiarity — the shared computation for the You tab (05 §5.3) and the
 * Search tab's "Your journey" layer (04 §4.3). ONE source of truth so the two
 * faces can never disagree.
 *
 * Formula (spec-v3 05 §5.3):
 *   coverage 40 pts — cards seen in the unit / "askable" signal count,
 *                      saturated at 25 cards
 *   decisiveness 30 — how far like/pass rate is from 50% (hesitation = not
 *                      familiar; 50/50 means guessing)
 *   dimensions 30   — 4 × 7.5 for the four pillar dims (safety / schools /
 *                      convenience / potential), each worth ✓ when the unit
 *                      has ≥2 signals
 *
 * The 4 pillar dims deliberately reuse the community four-pillar vocabulary
 * (03 §3.4) — one mental model across both faces.
 *
 * PURE: no react / zustand / expo imports.
 */
import type { DimKey } from "@percho/shared/types";
import type { GeoSignal } from "./feed/signals";

/** The four pillar dims, mirrored from the community four-pillar naming. */
export const PILLAR_DIMS: readonly DimKey[] = [
	"family", // safety proxy — the dim evidence we actually have
	"schools",
	"walkable", // convenience proxy
	"space", // potential proxy
] as const;

/** Cards seen beyond this count stop adding coverage points. */
export const COVERAGE_SATURATION = 25;

export interface UnitFamiliarity {
	unitId: string;
	/** 0–100. */
	score: number;
	/** 0–40. */
	coverage: number;
	/** 0–30. */
	decisiveness: number;
	/** 0–30. */
	dimensions: number;
	/** Count of cards the buyer saw in this unit. */
	cardsSeen: number;
	/** Pillar dims with ≥2 signals (has ✓). */
	knownDims: readonly DimKey[];
	/** Pillar dims still unknown — the "what Percho doesn't know" gap. */
	unknownDims: readonly DimKey[];
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/**
 * Given the geo signals the feed reducer already accumulates, return the
 * familiarity for one unit.
 *
 * `totalCardsInUnit` is the unit's share of the askable signal count — the
 * denominator for coverage. Pass the unit's real card count when the pool
 * knows it; default 25 (the saturation point) when unknown so a thin signal
 * still registers as 100% coverage.
 */
export function familiarityFor(
	signals: {
		geo: readonly GeoSignal[];
		dims: Readonly<Record<string, number>>;
	},
	unitId: string,
	totalCardsInUnit: number = COVERAGE_SATURATION,
): UnitFamiliarity {
	const sig = signals.geo.find((g) => g.unitId === unitId);
	const cardsSeen = sig ? Math.round(sig.right + sig.left) : 0;
	// A unit the buyer never swiped has no like/pass split — 0% "liked" must
	// not read as a decisive NO (that would credit 30 decisiveness to a unit
	// they never saw).
	const likeRate =
		sig && sig.right + sig.left > 0 ? sig.right / (sig.right + sig.left) : 0.5;

	const coverage = clamp(
		(cardsSeen / Math.max(1, totalCardsInUnit)) * 40,
		0,
		40,
	);
	const decisiveness = clamp(Math.abs(likeRate - 0.5) * 2 * 30, 0, 30);
	const knownDims = PILLAR_DIMS.filter((d) => (signals.dims[d] ?? 0) >= 2);
	const unknownDims = PILLAR_DIMS.filter((d) => !knownDims.includes(d));
	const dimensions = knownDims.length * 7.5;

	// Floor each component: 7.5 rounds UP to 8 (half-up), which over-credits a
	// single known pillar as nearly half the whole dimension budget.
	return {
		unitId,
		score: Math.round(
			clamp(
				Math.floor(coverage) + Math.floor(decisiveness) + dimensions,
				0,
				100,
			),
		),
		coverage: Math.floor(coverage),
		decisiveness: Math.floor(decisiveness),
		dimensions,
		cardsSeen,
		knownDims,
		unknownDims,
	};
}

/** A terse gap summary for the You-tab row ("safety & schools still unknown"). */
export function unknownDimsLabel(unknownDims: readonly DimKey[]): string {
	if (unknownDims.length === 0) return "all four pillars known";
	const labels: Partial<Record<DimKey, string>> = {
		family: "safety",
		schools: "schools",
		walkable: "convenience",
		space: "potential",
	};
	return `${unknownDims.map((d) => labels[d] ?? d).join(" & ")} still unknown`;
}
