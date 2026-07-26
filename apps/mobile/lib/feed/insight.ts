/**
 * §1.6 insight earning (PLAN B13, owner-approved default).
 *
 * An insight is the app telling the buyer something about themselves, so it is
 * only allowed to fire once the evidence exists: a dim must have accumulated
 * `INSIGHT_EVIDENCE` worth of positive signal, and the same dim never fires
 * twice (agreed or rejected, both close the topic).
 *
 * HARD RULE, same as `GeoStats`: the evidence string quotes the real running
 * count. There is no authored "we think you like X" copy with a fabricated
 * number behind it — if the number isn't there, no insight card is emitted and
 * the slot falls back to its `fallback` fill.
 *
 * Pure: no react/react-native/expo/zustand imports.
 */
import type { DimKey } from "@percho/shared";
import type { InsightCardV3 } from "./card-types";
import type { SignalState } from "./signals";

/**
 * §1.6 "≥6 of 8 same-dim likes". Tease listings carry 0.5× weight, so this is
 * a weight threshold rather than a swipe count — six full-weight likes, or
 * twelve teases, both clear it.
 */
export const INSIGHT_EVIDENCE = 6;

/** Human-readable dim labels for insight copy. Real vocabulary, no invention. */
const DIM_PHRASE: Partial<Record<DimKey, string>> = {
	schools: "school quality",
	walkable: "being able to walk places",
	quiet: "quiet streets",
	outdoors: "outdoor space",
	trails: "trail access",
	nightlife: "a lively scene nearby",
	space: "room to grow",
	move_in: "move-in-ready homes",
	hip: "a neighborhood with character",
	entertaining: "space to host people",
	family: "a family-friendly street",
};

function phraseFor(dim: DimKey): string {
	return DIM_PHRASE[dim] ?? String(dim).replace(/_/g, " ");
}

/**
 * The strongest dim that has cleared the evidence bar and has not already been
 * surfaced. Ties break on the dim key so the same signals always produce the
 * same insight (determinism is asserted in `generate-feed.test.ts`).
 */
export function earnInsight(signals: SignalState): InsightCardV3 | null {
	const closed = new Set<string>([
		...signals.insightAgreed,
		...signals.insightRejected,
	]);

	let best: { dim: DimKey; score: number } | null = null;
	for (const [dim, score] of Object.entries(signals.dims)) {
		if (closed.has(dim)) continue;
		if (score < INSIGHT_EVIDENCE) continue;
		if (
			best === null ||
			score > best.score ||
			(score === best.score && dim < best.dim)
		) {
			best = { dim: dim as DimKey, score };
		}
	}
	if (best === null) return null;

	const phrase = phraseFor(best.dim);
	// Weights are halves at worst (TEASE_WEIGHT), so trim a trailing ".0".
	const count = Number.isInteger(best.score)
		? String(best.score)
		: best.score.toFixed(1);
	return {
		kind: "insight",
		id: `insight-${best.dim}`,
		dim: best.dim,
		text: `You keep choosing ${phrase}.`,
		evidence: `${count} of your swipes pointed here.`,
	};
}
