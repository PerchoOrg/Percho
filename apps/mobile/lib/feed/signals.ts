/**
 * The pure signal reducer. `applySwipe(signals, card, verdict)` is the ONLY way
 * signal state changes, so every downstream question (has this city focused?
 * is this layer fatigued? which communities are liked?) is answered by reading
 * one immutable structure rather than by re-deriving from an event log.
 *
 * Pure: no store reads, no Date.now(), no Math.random(). `dtMs` and other
 * clock-dependent telemetry are the caller's to supply (see `events.ts`).
 */
import type { DimKey } from "@percho/shared";
import type {
	BudgetBand,
	FeedCardV3,
	FunnelLayer,
	SwipeVerdict,
} from "./card-types";
import type { GeoLevel } from "./geo-unit";

/** §1.7: a tease listing's signal counts, at half weight, toward advance. */
export const TEASE_WEIGHT = 0.5;
/** §1.7 layer fatigue: 15 swipes with zero positive signal stops the layer. */
export const FATIGUE_WINDOW = 15;

export interface GeoSignal {
	unitId: string;
	level: GeoLevel;
	/** Sum of weights; a tease contributes 0.5 (§1.7). */
	right: number;
	left: number;
}

export interface TradeoffRecord {
	cardId: string;
	dimLeft: DimKey;
	dimRight: DimKey;
	chosen: DimKey;
}

export interface SignalState {
	/** Confirmed buying intent, from a stage-0 ask. */
	intent?: string;
	/** Narrowed by successive binary splits — never a slider (§1.7 / iron law). */
	budget?: BudgetBand;
	/** Dim → net weight. Life/lifestyle signals accumulate here. */
	dims: Readonly<Record<string, number>>;
	geo: readonly GeoSignal[];
	likedCommunityIds: readonly string[];
	passedCommunityIds: readonly string[];
	likedListingIds: readonly string[];
	tradeoffs: readonly TradeoffRecord[];
	/** Insight dims already agreed/disagreed, so one never repeats. */
	insightAgreed: readonly DimKey[];
	insightRejected: readonly DimKey[];
	/** Per-layer count of consecutive swipes with no positive signal (§1.7). */
	dryStreak: Readonly<Record<string, number>>;
	/** Layers the user explicitly skipped via "Skip this topic" (§1.2 #4). */
	skippedLayers: readonly FunnelLayer[];
	/** Total swipes in the current stage — telemetry for `stage_advance`. */
	swipesInStage: number;
}

export const EMPTY_SIGNALS: SignalState = {
	dims: {},
	geo: [],
	likedCommunityIds: [],
	passedCommunityIds: [],
	likedListingIds: [],
	tradeoffs: [],
	insightAgreed: [],
	insightRejected: [],
	dryStreak: {},
	skippedLayers: [],
	swipesInStage: 0,
};

function bump(
	map: Readonly<Record<string, number>>,
	key: string,
	delta: number,
): Record<string, number> {
	return { ...map, [key]: (map[key] ?? 0) + delta };
}

function addGeo(
	geo: readonly GeoSignal[],
	unitId: string,
	level: GeoLevel,
	verdict: SwipeVerdict,
	weight: number,
): GeoSignal[] {
	const idx = geo.findIndex((g) => g.unitId === unitId);
	const delta =
		verdict === "right"
			? { right: weight, left: 0 }
			: { right: 0, left: weight };
	if (idx === -1) {
		return [...geo, { unitId, level, right: delta.right, left: delta.left }];
	}
	const next = [...geo];
	const cur = next[idx];
	if (!cur) return next;
	next[idx] = {
		...cur,
		right: cur.right + delta.right,
		left: cur.left + delta.left,
	};
	return next;
}

function withoutId(ids: readonly string[], id: string): string[] {
	return ids.filter((x) => x !== id);
}

/** Which funnel layer a card's swipe counts against, for fatigue purposes. */
export function layerOf(card: FeedCardV3): FunnelLayer | null {
	switch (card.kind) {
		case "ask":
			return card.layer;
		case "area":
			return card.unit.level;
		case "community":
			return "community";
		default:
			// tradeoff / challenge / insight / listing / milestone are not layer
			// probes; §1.7 fatigue explicitly compensates via trade-off, so a
			// trade-off swipe must not reset or advance a layer's dry streak.
			return null;
	}
}

/**
 * Did this swipe carry a positive signal? A left swipe never does. A right swipe
 * on an area/community/listing does. An either-or card (trade-off, either-or
 * ask) always produces a signal regardless of direction — there is no "no" side
 * — which is why `insight`'s left swipe (an explicit disagree) is the only
 * right/left pair where left is still informative but not positive.
 */
function isPositive(card: FeedCardV3, verdict: SwipeVerdict): boolean {
	if (card.kind === "ask") {
		return card.choice.form === "either-or" ? true : verdict === "right";
	}
	if (card.kind === "tradeoff") return true;
	return verdict === "right";
}

export function applySwipe(
	signals: SignalState,
	card: FeedCardV3,
	verdict: SwipeVerdict,
): SignalState {
	let next: SignalState = {
		...signals,
		swipesInStage: signals.swipesInStage + 1,
	};

	switch (card.kind) {
		case "ask": {
			const record =
				card.choice.form === "yes-no"
					? verdict === "right"
						? card.choice.affirm
						: null
					: verdict === "right"
						? card.choice.right.record
						: card.choice.left.record;
			if (record) {
				if (record.type === "intent") next = { ...next, intent: record.value };
				else if (record.type === "budget")
					next = { ...next, budget: record.band };
				else if (record.type === "dim")
					next = { ...next, dims: bump(next.dims, record.dim, 1) };
				else
					next = {
						...next,
						geo: addGeo(next.geo, record.unitId, record.level, "right", 1),
					};
			}
			break;
		}

		case "area": {
			// §1.7 "软排序, 非过滤": a left swipe downweights the unit, it never
			// removes it from the pool. Hard filtering under a swipe rhythm produces
			// an empty feed.
			next = {
				...next,
				geo: addGeo(next.geo, card.unit.id, card.unit.level, verdict, 1),
			};
			break;
		}

		case "community": {
			const liked = withoutId(next.likedCommunityIds, card.id);
			const passed = withoutId(next.passedCommunityIds, card.id);
			next =
				verdict === "right"
					? {
							...next,
							likedCommunityIds: [...liked, card.id],
							passedCommunityIds: passed,
						}
					: {
							...next,
							likedCommunityIds: liked,
							passedCommunityIds: [...passed, card.id],
						};
			if (card.geoUnitId) {
				next = {
					...next,
					geo: addGeo(next.geo, card.geoUnitId, "city", verdict, 1),
				};
			}
			for (const d of card.dims ?? []) {
				if (verdict === "right")
					next = { ...next, dims: bump(next.dims, d, 1) };
			}
			break;
		}

		case "listing": {
			// §1.7: a tease listing is a weak listing signal AND a 0.5×-weighted
			// geographic signal for the unit it sits in — that is the whole point of
			// showing it before the funnel opens listings.
			const weight = card.tease ? TEASE_WEIGHT : 1;
			if (verdict === "right") {
				next = {
					...next,
					likedListingIds: [
						...withoutId(next.likedListingIds, card.id),
						card.id,
					],
				};
			} else {
				next = {
					...next,
					likedListingIds: withoutId(next.likedListingIds, card.id),
				};
			}
			if (card.geoUnitId) {
				next = {
					...next,
					geo: addGeo(next.geo, card.geoUnitId, "city", verdict, weight),
				};
			}
			for (const d of card.dims ?? []) {
				if (verdict === "right")
					next = { ...next, dims: bump(next.dims, d, weight) };
			}
			break;
		}

		case "tradeoff": {
			const chosen = verdict === "right" ? card.right.dim : card.left.dim;
			const discarded = verdict === "right" ? card.left.dim : card.right.dim;
			next = {
				...next,
				dims: bump(bump(next.dims, chosen, 1), discarded, -0.5),
				tradeoffs: [
					...next.tradeoffs,
					{
						cardId: card.id,
						dimLeft: card.left.dim,
						dimRight: card.right.dim,
						chosen,
					},
				],
			};
			break;
		}

		case "insight": {
			next =
				verdict === "right"
					? {
							...next,
							insightAgreed: [...next.insightAgreed, card.dim],
							dims: bump(next.dims, card.dim, 1),
						}
					: {
							// §1.6 left = disagree: downweight the evidence chain that
							// produced the observation.
							...next,
							insightRejected: [...next.insightRejected, card.dim],
							dims: bump(next.dims, card.dim, -1),
						};
			break;
		}

		case "challenge":
		case "milestone":
			// Market education and ceremony carry no preference signal.
			break;
	}

	const layer = layerOf(card);
	if (layer) {
		next = {
			...next,
			dryStreak: isPositive(card, verdict)
				? { ...next.dryStreak, [layer]: 0 }
				: bump(next.dryStreak, layer, 1),
		};
	}

	return next;
}

/**
 * "Not sure" on an insight card (§1.6): explicitly records nothing. It is not a
 * swipe, so it must not touch dims, streaks, or the in-stage swipe count.
 */
export function applyInsightUnsure(
	signals: SignalState,
	_card: FeedCardV3,
): SignalState {
	return signals;
}

export function applySkipLayer(
	signals: SignalState,
	layer: FunnelLayer,
): SignalState {
	if (signals.skippedLayers.includes(layer)) return signals;
	return { ...signals, skippedLayers: [...signals.skippedLayers, layer] };
}

/** §1.7: 15 swipes on a layer with zero positive signal stops its cards. */
export function isLayerFatigued(
	signals: SignalState,
	layer: FunnelLayer,
): boolean {
	return (signals.dryStreak[layer] ?? 0) >= FATIGUE_WINDOW;
}

/** A layer is suppressed if the user skipped it OR it fatigued out. */
export function isLayerSuppressed(
	signals: SignalState,
	layer: FunnelLayer,
): boolean {
	return (
		signals.skippedLayers.includes(layer) || isLayerFatigued(signals, layer)
	);
}

export function geoSignalFor(
	signals: SignalState,
	unitId: string,
): GeoSignal | undefined {
	return signals.geo.find((g) => g.unitId === unitId);
}

export function dimScore(signals: SignalState, dim: DimKey): number {
	return signals.dims[dim] ?? 0;
}
