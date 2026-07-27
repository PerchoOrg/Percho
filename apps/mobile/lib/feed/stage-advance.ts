/**
 * The §1.7 promotion gates, as one pure function re-evaluated after every swipe.
 *
 * `evaluateStageAdvance` returns the stage to promote TO, or null. It never
 * returns a stage at or below the current one — the same monotonic guard
 * `funnel.ts` enforces at the store boundary, asserted here too so the rule
 * holds even if a caller forgets to route through `promoteTo`.
 *
 * The geo pool is an argument, not a store read, because the 2→3 gate counts
 * units at the FINEST AVAILABLE level (PLAN §3). With `communities.zip` 100%
 * NULL today that means city-level units; when the zip backfill lands the same
 * gate counts zips with no code change.
 */
import type { DimKey } from "@percho/shared";
import type { FunnelStage } from "./card-types";
import { type GeoLevel, type GeoUnit, finestAvailableLevel } from "./geo-unit";
import type { SignalState } from "./signals";

// ─── §1.7 thresholds, named ─────────────────────────────────────────

/** 0→1: distinct life/lifestyle dims that must show positive signal. */
export const LIFE_SIGNALS_REQUIRED = 2;
/** 1→2: right-swipe weight a city (plus its descendants) needs to "focus". */
export const CITY_FOCUS_RIGHT = 3;
/** 1→2: right-swipe rate must EXCEED this — 50% exactly does not pass. */
export const CITY_FOCUS_RATE = 0.5;
/** 2→3: right-swipe weight one finest-level unit needs to count. */
export const UNIT_FOCUS_RIGHT = 2;
/** 2→3: how many such units open the gate. §1.7's "2–4" band starts at 2. */
export const UNITS_FOCUSED_REQUIRED = 2;
/** 3→4: community likes required. The strongest signal in the funnel. */
export const COMMUNITY_LIKES_REQUIRED = 2;

export interface AdvanceContext {
	/** The geo pool currently in play — drives the finest-level reading. */
	units: readonly GeoUnit[];
}

/** Dims that count as a "life signal" for the 0→1 gate. */
const LIFE_DIMS: readonly DimKey[] = [
	"family",
	"outdoors",
	"walkable",
	"quiet",
	"hip",
	"entertaining",
	"trails",
	"nightlife",
	"schools",
	"move_in",
	"space",
];

export function countLifeSignals(signals: SignalState): number {
	return LIFE_DIMS.filter((d) => (signals.dims[d] ?? 0) > 0).length;
}

function descendantsOf(units: readonly GeoUnit[], rootId: string): Set<string> {
	const out = new Set<string>([rootId]);
	// Pool depth is 3 (area → city → zip), so a fixed-point loop converges in at
	// most 3 passes; no recursion needed.
	let grew = true;
	while (grew) {
		grew = false;
		for (const u of units) {
			if (u.parentId && out.has(u.parentId) && !out.has(u.id)) {
				out.add(u.id);
				grew = true;
			}
		}
	}
	return out;
}

export interface FocusTally {
	unitId: string;
	right: number;
	left: number;
	rate: number;
}

/**
 * §1.7's 1→2 gate reads "该 city 及其下级右滑 ≥3 且右滑率 >50%" — a city's own
 * swipes PLUS everything beneath it, so a buyer who right-swipes three zips
 * inside Decatur has focused Decatur even without swiping Decatur itself.
 */
export function cityFocusTallies(
	signals: SignalState,
	units: readonly GeoUnit[],
): FocusTally[] {
	return units
		.filter((u) => u.level === "city")
		.map((city) => {
			const family = descendantsOf(units, city.id);
			let right = 0;
			let left = 0;
			for (const g of signals.geo) {
				if (!family.has(g.unitId)) continue;
				right += g.right;
				left += g.left;
			}
			const total = right + left;
			return {
				unitId: city.id,
				right,
				left,
				rate: total === 0 ? 0 : right / total,
			};
		});
}

export function isCityFocused(tally: FocusTally): boolean {
	return tally.right >= CITY_FOCUS_RIGHT && tally.rate > CITY_FOCUS_RATE;
}

/** Units at `level` carrying at least `UNIT_FOCUS_RIGHT` right-swipe weight. */
export function focusedUnitsAtLevel(
	signals: SignalState,
	level: GeoLevel,
): string[] {
	return signals.geo
		.filter((g) => g.level === level && g.right >= UNIT_FOCUS_RIGHT)
		.map((g) => g.unitId);
}

export function evaluateStageAdvance(
	stage: FunnelStage,
	signals: SignalState,
	ctx: AdvanceContext,
): FunnelStage | null {
	switch (stage) {
		case 0: {
			const ready =
				!!signals.intent &&
				!!signals.budget &&
				countLifeSignals(signals) >= LIFE_SIGNALS_REQUIRED;
			return ready ? 1 : null;
		}

		case 1: {
			const focused = cityFocusTallies(signals, ctx.units).some(isCityFocused);
			return focused ? 2 : null;
		}

		case 2: {
			// The finest level with inventory, NOT a hardcoded 'zip'. Reading §1.7
			// literally would stall the funnel one step short of Stage 3 for as long
			// as communities.zip stays NULL (PLAN §3, owner-approved).
			const level = finestAvailableLevel(ctx.units);
			if (!level) return null;
			const focused = focusedUnitsAtLevel(signals, level);
			return focused.length >= UNITS_FOCUSED_REQUIRED ? 3 : null;
		}

		case 3: {
			return signals.likedCommunityIds.length >= COMMUNITY_LIKES_REQUIRED
				? 4
				: null;
		}

		case 4:
			// Terminal. Stage 4 keeps learning, but there is nowhere to go (§1.7).
			return null;
	}
}
