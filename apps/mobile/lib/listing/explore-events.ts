/**
 * §2.6 telemetry contract for the listing explore surface — the event union plus
 * pure constructors.
 *
 * Why a SECOND event module rather than widening `lib/feed/events.ts`: §1.10 and
 * §2.6 are two different streams with two different tables
 * (`buyer_scope_events` vs `listing_explore_events`) and two different subject
 * keys — a scope event is about a CARD in a deck position, an explore event is
 * about a HOTSPOT inside one listing. Merging them would force every consumer to
 * discriminate on a field half the union does not have. They deliberately SHARE
 * the queue (`state/event-queue.ts`), because offline durability and drain order
 * are properties of the device, not of the table.
 *
 * Pure module, same rule as its §1.10 sibling: no `Date.now()`, no uuid, no
 * store reads. `seq` and `at` are injected so every event is reproducible in a
 * test.
 *
 * §9.7 silent-learning note: these events are the learning channel and are never
 * surfaced to the buyer. Nothing here may drive UI copy.
 */
import type { FunnelStage } from "../feed/card-types";
import type { ActionKind } from "./hotspot";

export interface ExploreEventBase {
	/** Monotonic client id, so a drained queue can dedupe server-side. */
	seq: number;
	/** Epoch ms, injected — never read from the clock inside this module. */
	at: number;
	funnelStage: FunnelStage;
	/** The listing every event in this stream is about. */
	listingId: string;
}

/**
 * `tour_stop_view` / `tour_complete` / `tour_abandoned` (§2.6 row 1) — the tour
 * completion funnel, which canon §7 names a core metric.
 *
 * `stopN` is 1-BASED, matching the "STOP 2 OF 4" the buyer sees, so an abandon
 * at stop 2 in the data means the same stop the screenshot shows. It is required
 * on all three types: a completion is "reached stop M of M", and recording that
 * as an absent field would make the drop-off curve unreconstructable.
 */
export interface TourEvent extends ExploreEventBase {
	type: "tour_stop_view" | "tour_complete" | "tour_abandoned";
	stopN: number;
	stopCount: number;
	stopId: string;
}

/**
 * `hotspot_open(hotspot_id, dwell_ms)` (§2.6 row 2) — time-on-hotspot is a
 * ranking signal, so dwell is carried on CLOSE rather than open: an open-only
 * event has no duration, and a separate close event would make the consumer join
 * two rows to get one number.
 */
export interface HotspotEvent extends ExploreEventBase {
	type: "hotspot_open";
	hotspotId: string;
	/** ms the sheet stayed open. Injected by the caller from its own clock. */
	dwellMs: number;
}

/**
 * `action_tap(kind)` (§2.6 row 3). The distribution matters as much as the
 * count: >70% share for one action means the others fail the 30-Second Rule and
 * the set gets re-reviewed. `hotspotId` is therefore required — a global tally
 * cannot tell "Compare is unused" from "Compare is unused IN BATHROOMS".
 */
export interface ActionTapEvent extends ExploreEventBase {
	type: "action_tap";
	hotspotId: string;
	kind: ActionKind;
	/** Which surface the row was tapped on; the tour and the sheet both emit. */
	surface: "tour" | "sheet";
}

/** `save_feature(feature)` (§2.6 row 4) — goes straight into the profile. */
export interface SaveFeatureEvent extends ExploreEventBase {
	type: "save_feature";
	hotspotId: string;
	/** The feature as the buyer saw it labelled, not an internal id. */
	feature: string;
}

/**
 * `datapoint_focus(key)` (§2.6 row 5) — which deep-linked row got tapped, which
 * decides data-face row ordering in v1.1.
 */
export interface DatapointFocusEvent extends ExploreEventBase {
	type: "datapoint_focus";
	focusKey: string;
}

/**
 * `evidence_cited(stop_id, evidence_ids)` (§2.6 row 6) — which profile signals
 * were actually put in front of the buyer, so dead signals can be found.
 */
export interface EvidenceCitedEvent extends ExploreEventBase {
	type: "evidence_cited";
	stopId: string;
	evidenceIds: readonly string[];
}

// ─── Phase114 explore-page events (spec §5) ─────────────────────────────────
// The redesigned explore page's preference-engine inputs. Same stream, same
// queue, same purity rules as the §2.6 events above.

/** `explore_open` — the page was reached. */
export interface ExploreOpenEvent extends ExploreEventBase {
	type: "explore_open";
}

/**
 * `media_swipe(index, room, dwellMs)` — the carousel changed slides. `dwellMs`
 * is how long the PREVIOUS slide was watched; which rooms a buyer lingers on
 * is the highest-volume preference signal this page produces.
 */
export interface MediaSwipeEvent extends ExploreEventBase {
	type: "media_swipe";
	/** Slide arrived AT (0 = video). */
	index: number;
	/** Room group of that slide (`"video"` for slide 0). */
	room: string;
	/** ms the previous slide was watched. */
	dwellMs: number;
}

/** `room_jump(room)` — a room chip was tapped. Intent, not drift. */
export interface RoomJumpEvent extends ExploreEventBase {
	type: "room_jump";
	room: string;
}

/** `photo_fullscreen(index, room)` — the buyer opened the viewer on a photo. */
export interface PhotoFullscreenEvent extends ExploreEventBase {
	type: "photo_fullscreen";
	index: number;
	room: string;
}

/** `fit_dwell(ms)` — how long the FitCard was actually on screen. */
export interface FitDwellEvent extends ExploreEventBase {
	type: "fit_dwell";
	ms: number;
}

/** `tradeoff_vote(axis, value)` — the FitCard's one-question vote. */
export interface TradeoffVoteEvent extends ExploreEventBase {
	type: "tradeoff_vote";
	axis: string;
	value: "worth" | "not";
}

/** `cost_adjust(downPct, ratePct)` — the calculator's inputs moved. */
export interface CostAdjustEvent extends ExploreEventBase {
	type: "cost_adjust";
	downPct: number;
	ratePct: number;
}

/** `dock_action` — ✕ / ♡ / Request a tour, same semantics as the feed swipe. */
export interface DockActionEvent extends ExploreEventBase {
	type: "dock_action";
	action: "pass" | "save" | "unsave" | "tour";
}

// ─── Phase125 move-in question events (move-in-questions.md §5) ─────────────

/**
 * `question_open(question_id, rank_shown, dwell_ms)` — the core signal. Dwell
 * is carried on CLOSE, same reasoning as `hotspot_open`: an open-only event
 * has no duration. `rankShown` is the 0-based position the row held, so a
 * question opened from slot 5 can be told from one opened from slot 0.
 */
export interface QuestionOpenEvent extends ExploreEventBase {
	type: "question_open";
	questionId: string;
	rankShown: number;
	dwellMs: number;
}

/** `question_verify_tap` — the buyer plans to go and see. Strongest intent we have. */
export interface QuestionVerifyTapEvent extends ExploreEventBase {
	type: "question_verify_tap";
	questionId: string;
}

/** `question_source_tap(basis_index)` — which basis types buyers actually check. */
export interface QuestionSourceTapEvent extends ExploreEventBase {
	type: "question_source_tap";
	questionId: string;
	basisIndex: number;
}

/** `question_theme_browse(theme)` — weaker affinity than an open. */
export interface QuestionThemeBrowseEvent extends ExploreEventBase {
	type: "question_theme_browse";
	theme: string;
}

export type ExploreEvent =
	| TourEvent
	| HotspotEvent
	| ActionTapEvent
	| SaveFeatureEvent
	| DatapointFocusEvent
	| EvidenceCitedEvent
	| ExploreOpenEvent
	| MediaSwipeEvent
	| RoomJumpEvent
	| PhotoFullscreenEvent
	| FitDwellEvent
	| TradeoffVoteEvent
	| CostAdjustEvent
	| DockActionEvent
	| QuestionOpenEvent
	| QuestionVerifyTapEvent
	| QuestionSourceTapEvent
	| QuestionThemeBrowseEvent;

export type ExploreEventType = ExploreEvent["type"];

/** What every constructor needs, injected. Identical to the event base. */
type Ctx = ExploreEventBase;

export function buildTourEvent(
	ctx: Ctx,
	input: {
		type: TourEvent["type"];
		/** Zero-based index as held in component state; converted here. */
		stopIndex: number;
		stopCount: number;
		stopId: string;
	},
): TourEvent {
	return {
		...ctx,
		type: input.type,
		stopN: input.stopIndex + 1,
		stopCount: input.stopCount,
		stopId: input.stopId,
	};
}

export function buildHotspotEvent(
	ctx: Ctx,
	input: { hotspotId: string; dwellMs: number },
): HotspotEvent {
	return {
		...ctx,
		type: "hotspot_open",
		hotspotId: input.hotspotId,
		// A negative dwell can only come from a clock adjustment mid-sheet, and a
		// negative duration in the ranking signal is worse than a zero.
		dwellMs: Math.max(0, Math.round(input.dwellMs)),
	};
}

export function buildActionTapEvent(
	ctx: Ctx,
	input: {
		hotspotId: string;
		kind: ActionKind;
		surface: ActionTapEvent["surface"];
	},
): ActionTapEvent {
	return { ...ctx, type: "action_tap", ...input };
}

export function buildSaveFeatureEvent(
	ctx: Ctx,
	input: { hotspotId: string; feature: string },
): SaveFeatureEvent {
	return { ...ctx, type: "save_feature", ...input };
}

export function buildDatapointFocusEvent(
	ctx: Ctx,
	input: { focusKey: string },
): DatapointFocusEvent {
	return { ...ctx, type: "datapoint_focus", focusKey: input.focusKey };
}

/**
 * §2.6 row 6. Returns null when the stop cited nothing: an `evidence_cited` with
 * an empty array would be indistinguishable from "this stop's evidence was
 * never rendered", which is the exact question the event exists to answer.
 * (`lib/listing/tour.ts` already refuses to emit an evidence-free stop, so this
 * is a second guard, not the primary one.)
 */
export function buildEvidenceCitedEvent(
	ctx: Ctx,
	input: { stopId: string; evidenceIds: readonly string[] },
): EvidenceCitedEvent | null {
	if (input.evidenceIds.length === 0) return null;
	return {
		...ctx,
		type: "evidence_cited",
		stopId: input.stopId,
		evidenceIds: [...input.evidenceIds],
	};
}

// ─── Phase114 constructors ──────────────────────────────────────────────────

export function buildExploreOpenEvent(ctx: Ctx): ExploreOpenEvent {
	return { ...ctx, type: "explore_open" };
}

export function buildMediaSwipeEvent(
	ctx: Ctx,
	input: { index: number; room: string; dwellMs: number },
): MediaSwipeEvent {
	return {
		...ctx,
		type: "media_swipe",
		index: input.index,
		room: input.room,
		// Same clock-adjustment guard as `hotspot_open`'s dwell.
		dwellMs: Math.max(0, Math.round(input.dwellMs)),
	};
}

export function buildRoomJumpEvent(
	ctx: Ctx,
	input: { room: string },
): RoomJumpEvent {
	return { ...ctx, type: "room_jump", room: input.room };
}

export function buildPhotoFullscreenEvent(
	ctx: Ctx,
	input: { index: number; room: string },
): PhotoFullscreenEvent {
	return { ...ctx, type: "photo_fullscreen", ...input };
}

/**
 * Null under 500ms: that is a scroll-past, and recording it as a dwell would
 * teach the engine that every buyer studies the FitCard.
 */
export function buildFitDwellEvent(
	ctx: Ctx,
	input: { ms: number },
): FitDwellEvent | null {
	const ms = Math.round(input.ms);
	if (ms < 500) return null;
	return { ...ctx, type: "fit_dwell", ms };
}

export function buildTradeoffVoteEvent(
	ctx: Ctx,
	input: { axis: string; value: TradeoffVoteEvent["value"] },
): TradeoffVoteEvent {
	return { ...ctx, type: "tradeoff_vote", ...input };
}

export function buildCostAdjustEvent(
	ctx: Ctx,
	input: { downPct: number; ratePct: number },
): CostAdjustEvent {
	return { ...ctx, type: "cost_adjust", ...input };
}

export function buildDockActionEvent(
	ctx: Ctx,
	input: { action: DockActionEvent["action"] },
): DockActionEvent {
	return { ...ctx, type: "dock_action", action: input.action };
}

// ─── Phase125 constructors ───────────────────────────────────────────────────

export function buildQuestionOpenEvent(
	ctx: Ctx,
	input: { questionId: string; rankShown: number; dwellMs: number },
): QuestionOpenEvent {
	return {
		...ctx,
		type: "question_open",
		questionId: input.questionId,
		rankShown: input.rankShown,
		// Same clamp as hotspot_open: a clock change must not poison ranking.
		dwellMs: Math.max(0, Math.round(input.dwellMs)),
	};
}

export function buildQuestionVerifyTapEvent(
	ctx: Ctx,
	input: { questionId: string },
): QuestionVerifyTapEvent {
	return { ...ctx, type: "question_verify_tap", questionId: input.questionId };
}

export function buildQuestionSourceTapEvent(
	ctx: Ctx,
	input: { questionId: string; basisIndex: number },
): QuestionSourceTapEvent {
	return { ...ctx, type: "question_source_tap", ...input };
}

export function buildQuestionThemeBrowseEvent(
	ctx: Ctx,
	input: { theme: string },
): QuestionThemeBrowseEvent {
	return { ...ctx, type: "question_theme_browse", theme: input.theme };
}
