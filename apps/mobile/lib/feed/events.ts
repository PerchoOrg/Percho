/**
 * §1.10 telemetry contract — the event union + pure constructors.
 *
 * NO TABLE IN THIS TASK. `buyer_scope_events` does not exist and the existing
 * `events` table is structurally wrong for it (`events.listing_id` is an FK to
 * `listings`; its route zod-validates a union requiring exactly one uuid, while
 * buyer swipes are anonymous with string ids like `ask-purpose-primary`).
 * Widening that union would loosen validation on the agent-facing analytics
 * path. So task-1 ships the *client* contract only: typed events, a capped
 * FIFO, drain-on-reconnect, and a no-op transport. The table and
 * `/api/mobile/events` land with their consumer.
 *
 * Pure module: no Date.now(), no uuid, no store reads. Timestamps and ids are
 * passed in by the caller so every event is reproducible in a test.
 */
import type {
	CardKindV3,
	FeedCardV3,
	FunnelLayer,
	FunnelStage,
	SwipeVerdict,
} from "./card-types";
import type { GeoLevel } from "./geo-unit";
import { layerOf } from "./signals";

/** Wire verdict per §1.10 ("verdict(L/R)"). */
export type WireVerdict = "L" | "R";

/**
 * §1.10's `geo_level` is coarser than the engine's `GeoLevel` (area/city/zip):
 * a community swipe is a geo signal too, but "community" is deliberately NOT a
 * `GeoUnit` level in the engine (communities are their own table with their own
 * media and boundary). Widening only the wire type keeps that separation while
 * still letting the funnel report which granularity a swipe landed on.
 */
export type WireGeoLevel = GeoLevel | "community";

export interface EventBase {
	/** Client-generated monotonic id, so a drained queue can dedupe server-side. */
	seq: number;
	/** Epoch ms, injected — never read from the clock inside this module. */
	at: number;
	funnelStage: FunnelStage;
	sessionN: number;
}

export interface SwipeEvent extends EventBase {
	type: "swipe";
	cardId: string;
	cardType: CardKindV3;
	geoLevel?: WireGeoLevel;
	verdict: WireVerdict;
	/** ms since the previous swipe; absent for the first swipe of a session. */
	dtSincePrevSwipe?: number;
	activeIndex: number;
}

/**
 * §1.10 groups explore_tap / datapoint_tap: card_id + originating gesture.
 *
 * `flip` was the third type here and is gone with the flip mechanic itself
 * (2026-07-30). Removed rather than kept as a never-emitted value, so a future
 * reader of the event stream cannot mistake its absence for a tracking gap.
 */
export interface GestureEvent extends EventBase {
	type: "explore_tap" | "datapoint_tap";
	cardId: string;
	cardType: CardKindV3;
	/** Only datapoint_tap carries a focus key (§1.10). */
	focusKey?: string;
}

export interface StageEvent extends EventBase {
	type: "stage_advance" | "milestone_cta" | "milestone_map_link";
	fromStage: FunnelStage;
	toStage: FunnelStage;
	swipesInStage: number;
}

export interface SkipLayerEvent extends EventBase {
	type: "skip_layer";
	layer: FunnelLayer;
}

export interface PersonaChangeEvent extends EventBase {
	type: "persona_change";
	oldPersona: string;
	newPersona: string;
}

export type ScopeEvent =
	| SwipeEvent
	| GestureEvent
	| StageEvent
	| SkipLayerEvent
	| PersonaChangeEvent;

export type ScopeEventType = ScopeEvent["type"];

export function wireVerdict(verdict: SwipeVerdict): WireVerdict {
	return verdict === "right" ? "R" : "L";
}

/**
 * The geo level of a card, for `swipe.geo_level`. Area cards carry an explicit
 * level; a community card is definitionally community-level; a geo-layer ask
 * reports the layer it is asking about. Everything else omits the field rather
 * than inventing one — a life-layer ask reported as a geo swipe would corrupt
 * the per-level swipe distribution in §1.10's health metrics.
 */
export function geoLevelOf(card: FeedCardV3): WireGeoLevel | undefined {
	switch (card.kind) {
		case "area":
			return card.unit.level;
		case "community":
			return "community";
		case "ask": {
			const layer = layerOf(card);
			return layer === "area" ||
				layer === "city" ||
				layer === "zip" ||
				layer === "community"
				? layer
				: undefined;
		}
		default:
			return undefined;
	}
}

export interface SwipeEventInput {
	seq: number;
	at: number;
	card: FeedCardV3;
	verdict: SwipeVerdict;
	funnelStage: FunnelStage;
	sessionN: number;
	activeIndex: number;
	/** Epoch ms of the previous swipe; omit for the first swipe of a session. */
	prevSwipeAt?: number;
}

export function buildSwipeEvent(input: SwipeEventInput): SwipeEvent {
	const geoLevel = geoLevelOf(input.card);
	return {
		type: "swipe",
		seq: input.seq,
		at: input.at,
		funnelStage: input.funnelStage,
		sessionN: input.sessionN,
		cardId: input.card.id,
		cardType: input.card.kind,
		...(geoLevel ? { geoLevel } : {}),
		verdict: wireVerdict(input.verdict),
		...(input.prevSwipeAt !== undefined
			? { dtSincePrevSwipe: Math.max(0, input.at - input.prevSwipeAt) }
			: {}),
		activeIndex: input.activeIndex,
	};
}

export function buildGestureEvent(input: {
	seq: number;
	at: number;
	type: GestureEvent["type"];
	card: FeedCardV3;
	funnelStage: FunnelStage;
	sessionN: number;
	focusKey?: string;
}): GestureEvent {
	return {
		type: input.type,
		seq: input.seq,
		at: input.at,
		funnelStage: input.funnelStage,
		sessionN: input.sessionN,
		cardId: input.card.id,
		cardType: input.card.kind,
		...(input.type === "datapoint_tap" && input.focusKey
			? { focusKey: input.focusKey }
			: {}),
	};
}

export function buildStageEvent(input: {
	seq: number;
	at: number;
	type: StageEvent["type"];
	fromStage: FunnelStage;
	toStage: FunnelStage;
	swipesInStage: number;
	sessionN: number;
}): StageEvent {
	return {
		type: input.type,
		seq: input.seq,
		at: input.at,
		// The event's funnel_stage is where the user was when it fired.
		funnelStage: input.fromStage,
		sessionN: input.sessionN,
		fromStage: input.fromStage,
		toStage: input.toStage,
		swipesInStage: input.swipesInStage,
	};
}

export function buildSkipLayerEvent(input: {
	seq: number;
	at: number;
	layer: FunnelLayer;
	funnelStage: FunnelStage;
	sessionN: number;
}): SkipLayerEvent {
	return {
		type: "skip_layer",
		seq: input.seq,
		at: input.at,
		funnelStage: input.funnelStage,
		sessionN: input.sessionN,
		layer: input.layer,
	};
}

export function buildPersonaChangeEvent(input: {
	seq: number;
	at: number;
	oldPersona: string;
	newPersona: string;
	funnelStage: FunnelStage;
	sessionN: number;
}): PersonaChangeEvent {
	return {
		type: "persona_change",
		seq: input.seq,
		at: input.at,
		funnelStage: input.funnelStage,
		sessionN: input.sessionN,
		oldPersona: input.oldPersona,
		newPersona: input.newPersona,
	};
}
