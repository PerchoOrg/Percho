/**
 * Move-in questions on the explore page (phase126,
 * `docs/design/move-in-questions.md`).
 *
 * Three pure jobs:
 *
 *   `houseEraAnswer`  — the one answer that never needs research: the decade
 *                       a house was built decides what an inspector should
 *                       look at. Derived locally from `yearBuilt`, so the
 *                       section has real content before any server answer
 *                       exists.
 *   `mergeAnswers`    — server answers + local rule answers, server winning
 *                       on a shared id.
 *   `rankQuestions`   — order for display (doc §4): decisiveness × the
 *                       buyer's theme affinity, with the cold-start five
 *                       pinned up top until the buyer has opened anything.
 *
 * Answers whose id the bank does not carry, or whose question is reserved
 * (`fh: 'never'`), are dropped here as a last line — the server never sends
 * them, but the rule is cheap to hold on both sides.
 */
import {
	COLD_START,
	QUESTIONS,
	type QuestionDef,
	type QuestionTheme,
	questionById,
} from "@percho/shared/questions";
import type { ListingDetailDTO, QuestionAnswerDTO } from "./detail-dto";

/** How many questions show before "More questions". */
export const FIRST_N = 5;

export interface RankedQuestion {
	def: QuestionDef;
	answer: QuestionAnswerDTO;
}

/** Bank order, for a stable tie-break. */
const BANK_INDEX: ReadonlyMap<string, number> = new Map(
	QUESTIONS.map((q, i) => [q.id, i]),
);

/**
 * Decade → what to inspect. Each line is one thing an inspector can actually
 * check; the wording is what a buyer would hand over, not a lecture. Kept
 * deliberately short — the point is the handful that the era makes LIKELY,
 * not everything that could be wrong with a house.
 */
function eraChecklist(year: number): string[] {
	if (year < 1940) {
		return [
			"Knob-and-tube or cloth wiring still live behind the walls",
			"Lead paint (pre-1978) and a lead water service line",
			"Unreinforced brick or stone foundation, and how it drains",
			"Asbestos in pipe wrap, floor tile, or siding",
		];
	}
	if (year < 1960) {
		return [
			"Galvanised supply pipes — low pressure and rust are the tell",
			"Original clay or Orangeburg sewer line: get it scoped",
			"Lead paint (pre-1978); asbestos siding or floor tile",
			"A 60–100A panel that can't take an EV charger or heat pump",
		];
	}
	if (year < 1970) {
		return [
			"Panel brand — Federal Pacific and Zinsco panels of this era are insurance red flags",
			"Galvanised supply pipes and the original side sewer: scope it",
			"A buried heating-oil tank, decommissioned or not",
			"Asbestos in popcorn ceilings; single-pane aluminium windows",
		];
	}
	if (year < 1980) {
		return [
			"Aluminium branch wiring (1965–73) at every outlet and switch",
			"Lead paint (pre-1978) and asbestos in ceilings or flooring",
			"Age of the roof and furnace — likely on their second or third round",
		];
	}
	if (year < 1990) {
		return [
			"Polybutylene supply pipe (grey plastic, 1978–95)",
			"LP or Masonite siding, and fire-retardant roof sheathing of the 80s",
			"Radon — test it; mitigation is routine but not free",
		];
	}
	if (year < 2000) {
		return [
			"Polybutylene supply pipe (to 1995) and LP siding (to 1996)",
			"EIFS synthetic stucco, if present — moisture behind it",
			"Original windows and HVAC are at end of life",
		];
	}
	if (year < 2010) {
		return [
			"Chinese drywall (2001–09) in the Southeast: corroded copper is the tell",
			"Original HVAC and water heater at end of life",
			"CSST gas line bonding; builder-grade windows",
		];
	}
	if (year < 2020) {
		return [
			"Water heater and HVAC approaching first replacement",
			"Builder warranty transfer and any HOA transfer fees",
			"Settling cracks and grading around the foundation",
		];
	}
	return [
		"Punch-list items the builder never finished",
		"Grading and drainage once the lot has settled through a wet season",
		"Warranty transfer terms — what is still covered, and for whom",
	];
}

function decadeLabel(year: number): string {
	return `${Math.floor(year / 10) * 10}s`;
}

/** `house.era` from the listing's own record. Null without a year. */
export function houseEraAnswer(
	yearBuilt: number | undefined,
): QuestionAnswerDTO | null {
	if (yearBuilt === undefined || !Number.isFinite(yearBuilt)) return null;
	const year = Math.trunc(yearBuilt);
	const items = eraChecklist(year);
	return {
		id: "house.era",
		answer: `A ${decadeLabel(year)} build. Ask the inspector to look at:\n${items
			.map((i) => `• ${i}`)
			.join("\n")}`,
		basis: [{ type: "assessor", note: `Built ${year} (listing record)` }],
		verify: "Give this list to the inspector",
		decisiveness: 2,
		form: "checklist",
	};
}

/** Server answers first; a local rule fills an id the server did not send. */
export function mergeAnswers(detail: ListingDetailDTO): QuestionAnswerDTO[] {
	const out = new Map<string, QuestionAnswerDTO>();
	for (const a of detail.questions ?? []) out.set(a.id, a);
	const era = houseEraAnswer(detail.yearBuilt);
	if (era && !out.has(era.id)) out.set(era.id, era);
	return [...out.values()];
}

/** Theme → how many questions of that theme the buyer has opened. */
export type ThemeAffinity = Readonly<Partial<Record<QuestionTheme, number>>>;

/** Pinned bonus for the cold-start five while the buyer has opened nothing. */
const COLD_START_BONUS = 10;

/**
 * Doc §4: score = decisiveness × (1 + affinity[theme]); cold-start five get a
 * flat bonus only while the buyer has no affinity at all. Ties fall to bank
 * order so the list is stable between renders.
 */
export function rankQuestions(
	answers: readonly QuestionAnswerDTO[],
	affinity: ThemeAffinity,
): RankedQuestion[] {
	const total = Object.values(affinity).reduce((s, n) => s + (n ?? 0), 0);
	const cold = total === 0;
	const scored: { rq: RankedQuestion; score: number; idx: number }[] = [];
	for (const answer of answers) {
		const def = questionById(answer.id);
		if (!def || def.fh === "never") continue;
		const aff = affinity[def.theme] ?? 0;
		let score = answer.decisiveness * (1 + aff);
		if (cold && COLD_START.includes(def.id)) score += COLD_START_BONUS;
		scored.push({
			rq: { def, answer },
			score,
			idx: BANK_INDEX.get(def.id) ?? Number.MAX_SAFE_INTEGER,
		});
	}
	scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
	return scored.map((s) => s.rq);
}
