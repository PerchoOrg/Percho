/**
 * "After you move in" cards on the explore page (phase130).
 *
 * The server sends the approved cards; this module decides their order and
 * the summary strip above them. Both are pure.
 *
 * Order (owner-reviewed demo, 2026-08-29): weight first — the model's own
 * 1–3 call on how much a card could change the decision — then, within a
 * weight, warnings before upsides before facts, then the model's order. The
 * buyer's theme affinity (which themes they have lingered on before) tilts
 * the weight so a dog owner's pets card climbs on the next home.
 */
import {
	INSIGHT_KINDS,
	INSIGHT_THEMES,
	type InsightKind,
	type InsightTheme,
	KIND_LABELS,
} from "@percho/shared/insights";
import type { InsightDTO } from "./detail-dto";

/** Theme → how many cards of that theme the buyer has lingered on. */
export type ThemeAffinity = Readonly<Partial<Record<InsightTheme, number>>>;

const KIND_ORDER: Record<InsightKind, number> = { watch: 0, plus: 1, know: 2 };

function isTheme(t: string): t is InsightTheme {
	return (INSIGHT_THEMES as readonly string[]).includes(t);
}

export function rankInsights(
	insights: readonly InsightDTO[],
	affinity: ThemeAffinity,
): InsightDTO[] {
	return insights
		.map((card, i) => {
			const aff = isTheme(card.theme) ? (affinity[card.theme] ?? 0) : 0;
			return { card, i, score: card.decisiveness * (1 + aff) };
		})
		.sort(
			(a, b) =>
				b.score - a.score ||
				(KIND_ORDER[a.card.kind as InsightKind] ?? 3) -
					(KIND_ORDER[b.card.kind as InsightKind] ?? 3) ||
				a.i - b.i,
		)
		.map((s) => s.card);
}

export interface KindCount {
	kind: InsightKind;
	count: number;
	label: string;
}

/** The strip above the rail: "5 to watch · 2 upside · 1 good to know". */
export function summarizeKinds(insights: readonly InsightDTO[]): KindCount[] {
	const out: KindCount[] = [];
	for (const kind of INSIGHT_KINDS) {
		const count = insights.filter((c) => c.kind === kind).length;
		if (count > 0) out.push({ kind, count, label: KIND_LABELS[kind] });
	}
	return out;
}
