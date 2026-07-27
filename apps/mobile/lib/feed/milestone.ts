/**
 * `milestoneFor` — builds the §1.5 ceremony card for a stage advance.
 *
 * The chips are a RECAP OF CONFIRMED SCOPE, not a projection: every one is read
 * back out of `SignalState`, so a chip can only say something the buyer actually
 * told us. A milestone that congratulates a buyer on a preference they never
 * expressed is worse than showing no chips at all, so a thin signal set yields a
 * short card — same rule as `GeoStats` (PLAN §3).
 *
 * The stage copy names what the NEXT stage will show, because that is the
 * promise the CTA is making. It never quotes a count of anything ("47 homes
 * matched") — no such number is known at this point, and inventing one is the
 * exact failure §1.5's ceremony framing invites.
 *
 * Pure: no react/react-native/expo/zustand, no clock, no store reads.
 */
import type { DimKey } from "@percho/shared";
import { DIMS } from "@percho/shared";
import type { FunnelStage, MilestoneCardV3 } from "./card-types";
import type { GeoUnit } from "./geo-unit";
import type { SignalState } from "./signals";

/** Chips are a recap, not a dump — past ~4 the ceremony reads like a receipt. */
const MAX_CHIPS = 4;
/** A dim needs net-positive weight to be called a confirmed preference. */
const CHIP_DIM_MIN = 1;

interface StageCopy {
	headline: string;
	sub: string;
}

/**
 * Keyed by the stage being ENTERED. §1.7's stage names, phrased as what the
 * buyer is about to see rather than as a level-up.
 */
const COPY: Record<Exclude<FunnelStage, 0>, StageCopy> = {
	1: {
		headline: "We know what you're after.",
		sub: "Next: the places around Atlanta that fit it.",
	},
	2: {
		headline: "You've picked your part of town.",
		sub: "Next: a closer look inside it.",
	},
	3: {
		headline: "Your search has a shape now.",
		sub: "Next: the actual neighborhoods.",
	},
	4: {
		headline: "Homes are unlocked.",
		sub: "From here you'll see the listings themselves.",
	},
};

function budgetChip(signals: SignalState): string | null {
	const band = signals.budget;
	if (!band) return null;
	const k = (usd: number) => `$${Math.round(usd / 1000)}K`;
	if (band.minUsd !== undefined && band.maxUsd !== undefined) {
		return `${k(band.minUsd)}–${k(band.maxUsd)}`;
	}
	if (band.maxUsd !== undefined) return `Under ${k(band.maxUsd)}`;
	if (band.minUsd !== undefined) return `Over ${k(band.minUsd)}`;
	return null;
}

/** The dims the buyer leaned into, strongest first, ties broken on key. */
function topDims(signals: SignalState, limit: number): DimKey[] {
	return Object.entries(signals.dims)
		.filter(([, weight]) => weight >= CHIP_DIM_MIN)
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
		.slice(0, limit)
		.map(([dim]) => dim as DimKey);
}

/** Named geo units carrying real right-swipe weight, strongest first. */
function focusedPlaces(
	signals: SignalState,
	units: readonly GeoUnit[],
	limit: number,
): string[] {
	return (
		signals.geo
			.filter((g) => g.right > g.left)
			.sort((a, b) => b.right - a.right || (a.unitId < b.unitId ? -1 : 1))
			.map((g) => units.find((u) => u.id === g.unitId)?.name)
			// A unit no longer in the pool has no real name to show, and its id
			// ("city:decatur-ga") is not buyer-facing copy.
			.filter((name): name is string => name !== undefined)
			.slice(0, limit)
	);
}

export interface MilestoneInput {
	fromStage: FunnelStage;
	toStage: FunnelStage;
	signals: SignalState;
	/** The geo pool, so a unit id can be resolved to its real name. */
	units: readonly GeoUnit[];
}

/**
 * Returns null when `toStage` is 0 — there is no ceremony for being at the
 * start, and `funnel.ts` is monotonic so it is not reachable anyway.
 */
export function milestoneFor(input: MilestoneInput): MilestoneCardV3 | null {
	const { fromStage, toStage, signals, units } = input;
	if (toStage === 0) return null;
	const copy = COPY[toStage];

	// Place chips first: at the stages where a milestone fires, where the buyer
	// is looking is the more concrete confirmation.
	const chips: string[] = [...focusedPlaces(signals, units, 2)];

	const budget = budgetChip(signals);
	if (budget) chips.push(budget);

	for (const dim of topDims(signals, MAX_CHIPS)) {
		if (chips.length >= MAX_CHIPS) break;
		chips.push(DIMS[dim].label);
	}

	return {
		kind: "milestone",
		// One id per transition, so `milestonesShown` can suppress a repeat
		// across sessions (PLAN B3) without also suppressing a later stage.
		id: `milestone-${fromStage}-${toStage}`,
		fromStage,
		toStage,
		headline: copy.headline,
		sub: copy.sub,
		chips: chips.slice(0, MAX_CHIPS),
	};
}
