/**
 * The pure signal reducer. `applySwipe(signals, card, verdict)` is the ONLY way
 * signal state changes, so every downstream question (has this city focused?
 * which communities are liked?) is answered by reading one immutable structure
 * rather than by re-deriving from an event log.
 *
 * 2026-08-15: the funnel's preference machinery (intent, budget band, dims,
 * trade-off records, insight agree/reject) went out with the ask / challenge /
 * insight / milestone cards. What remains is what a swipe on the 4 surviving
 * kinds records: geo focus and community/listing likes.
 *
 * Pure: no store reads, no Date.now(), no Math.random(). `dtMs` and other
 * clock-dependent telemetry are the caller's to supply (see `events.ts`).
 */
import type { FeedCardV3, FunnelLayer, SwipeVerdict } from "./card-types";
import type { GeoLevel } from "./geo-unit";

/** §1.7 layer fatigue: 15 swipes with zero positive signal stops the layer. */
export const FATIGUE_WINDOW = 15;

export interface GeoSignal {
	unitId: string;
	level: GeoLevel;
	/** Sum of weights; a swipe contributes 1. */
	right: number;
	left: number;
}

/**
 * One answered trade-off, as a FACT rather than a weight.
 *
 * ── Why not just bump `dims` (2026-08-29) ───────────────────────────────────
 *
 * The old `+1 / −0.5` bump was not invertible: given `dims` you cannot say what
 * the buyer was asked or what they picked. Worse, 22 of the v2 bank's 32
 * questions have no `dim` and no `SideMatch` yet — freezing a weight at vote
 * time would make those answers permanently worthless.
 *
 * Recording the CHOICE instead means the matchers are read at ranking time from
 * `content.ts`. `SignalState` is persisted (zustand + AsyncStorage), so the day
 * a question gains a `match` — when the MLS mirror lands `lot_size`, `stories`,
 * `hoa` — every answer already given starts ranking retroactively, with no
 * migration and no code change here.
 */
export interface TradeoffAnswer {
	/** The question's axis. One per session, by the bank's own rule. */
	axis: string;
	/** Which question, so its sides can be re-read as the bank grows. */
	cardId: string;
	chose: "left" | "right";
}

export interface SignalState {
	geo: readonly GeoSignal[];
	/** Preference dimension scores, fed by trade-off swipes (§1.6). */
	dims: Readonly<Record<string, number>>;
	likedCommunityIds: readonly string[];
	passedCommunityIds: readonly string[];
	likedListingIds: readonly string[];
	/** Per-layer count of consecutive swipes with no positive signal. */
	dryStreak: Readonly<Record<string, number>>;
	/** Layers the user explicitly skipped via "Skip this topic". */
	skippedLayers: readonly FunnelLayer[];
	/** Total swipes in the current session — telemetry for `stage_advance`. */
	swipesInStage: number;
	/**
	 * Trade-off cards answered, lifetime. The You tab's persona subtitle
	 * ("Shaped by N likes · M trade-offs") needs the count and it cannot be
	 * recovered from `dims` (the +1/−0.5 bumps are not invertible). Optional:
	 * state persisted before this field existed rehydrates without it.
	 */
	tradeoffCount?: number;
	/**
	 * Every trade-off answered, newest last. Drives `rankListings` — see
	 * `TradeoffAnswer`. Optional: state persisted before this field existed
	 * rehydrates without it.
	 */
	answers?: readonly TradeoffAnswer[];
}

export const EMPTY_SIGNALS: SignalState = {
	geo: [],
	dims: {},
	likedCommunityIds: [],
	passedCommunityIds: [],
	likedListingIds: [],
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
		case "area":
			return card.unit.level;
		case "community":
			return "community";
		default:
			// tradeoff / listing are not layer probes; fatigue compensates via
			// trade-off, so a trade-off swipe must not advance a layer's streak.
			return null;
	}
}

/**
 * Did this swipe carry a positive signal? A left swipe never does. A right swipe
 * on an area/community/listing does. An either-or card (trade-off) always
 * produces a signal regardless of direction — there is no "no" side.
 */
function isPositive(card: FeedCardV3, verdict: SwipeVerdict): boolean {
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
		case "area": {
			// Soft ordering: a left swipe downweights the unit, it never removes
			// it from the pool. Hard filtering under a swipe rhythm produces an
			// empty feed.
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
			break;
		}

		case "listing": {
			next =
				verdict === "right"
					? {
							...next,
							likedListingIds: [
								...withoutId(next.likedListingIds, card.id),
								card.id,
							],
						}
					: {
							...next,
							likedListingIds: withoutId(next.likedListingIds, card.id),
						};
			if (card.geoUnitId) {
				next = {
					...next,
					geo: addGeo(next.geo, card.geoUnitId, "city", verdict, 1),
				};
			}
			break;
		}

		case "tradeoff": {
			// A trade-off is a preference statement: the chosen side boosts its
			// dim, the discarded side is softly downweighted (§1.6).
			const chosen = verdict === "right" ? card.right : card.left;
			const discarded = verdict === "right" ? card.left : card.right;
			next = {
				...next,
				tradeoffCount: (next.tradeoffCount ?? 0) + 1,
				answers: [
					...(next.answers ?? []),
					{
						axis: card.axis,
						cardId: card.id,
						chose: verdict === "right" ? "right" : "left",
					},
				],
			};
			/*
			 * Most of the v2 bank (2026-08-29) carries no `dim`: "One level /
			 * Two stories" is a measurable property of the house, not one of the
			 * eleven lifestyle dims. The vote is still COUNTED — it is what the
			 * axis-repeat rule and the fatigue model read — but nothing is
			 * bumped, because inventing a dim for it would record a preference
			 * the buyer never expressed.
			 */
			if (chosen.dim !== undefined) {
				next = { ...next, dims: bump(next.dims, chosen.dim, 1) };
			}
			if (discarded.dim !== undefined && discarded.dim !== chosen.dim) {
				next = { ...next, dims: bump(next.dims, discarded.dim, -0.5) };
			}
			break;
		}
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
 * The You tab's evidence correction (05 §5.3): "Still true? → No, remove"
 * drops the dim's accumulated weight outright. Removal, not decrement — the
 * buyer said the observation is wrong, and a wrong observation at half
 * strength is still wrong.
 */
export function applyDimRemoval(
	signals: SignalState,
	dim: string,
): SignalState {
	if (!(dim in signals.dims)) return signals;
	const dims = { ...signals.dims };
	delete dims[dim];
	return { ...signals, dims };
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
