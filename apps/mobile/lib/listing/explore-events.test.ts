/**
 * §2.6 explore-event tests.
 *
 * These constructors are the only place a stop index becomes a stop NUMBER and a
 * dwell becomes a non-negative integer, and both are off-by-one/sign bugs that
 * are invisible on a device and corrupt the completion funnel silently. Hence
 * tests on the arithmetic and on the two deliberate refusals.
 */
import { describe, expect, it } from "vitest";
import {
	buildActionTapEvent,
	buildDatapointFocusEvent,
	buildEvidenceCitedEvent,
	buildHotspotEvent,
	buildSaveFeatureEvent,
	buildTourEvent,
} from "./explore-events";

const ctx = {
	seq: 7,
	at: 1_785_000_000_000,
	funnelStage: 3 as const,
	listingId: "listing-1",
};

describe("buildTourEvent", () => {
	it("reports stop 1 for index 0 — the label the buyer sees", () => {
		const e = buildTourEvent(ctx, {
			type: "tour_stop_view",
			stopIndex: 0,
			stopCount: 4,
			stopId: "s0",
		});
		expect(e.stopN).toBe(1);
		expect(e.stopCount).toBe(4);
		expect(e.type).toBe("tour_stop_view");
	});

	it("carries the abandon point, so drop-off is reconstructable", () => {
		const e = buildTourEvent(ctx, {
			type: "tour_abandoned",
			stopIndex: 1,
			stopCount: 4,
			stopId: "s1",
		});
		// "abandoned at stop 2 of 4" — matches "STOP 2 OF 4" on screen.
		expect([e.stopN, e.stopCount]).toEqual([2, 4]);
	});

	it("passes the shared context through untouched", () => {
		const e = buildTourEvent(ctx, {
			type: "tour_complete",
			stopIndex: 3,
			stopCount: 4,
			stopId: "s3",
		});
		expect(e.seq).toBe(7);
		expect(e.at).toBe(ctx.at);
		expect(e.funnelStage).toBe(3);
		expect(e.listingId).toBe("listing-1");
	});
});

describe("buildHotspotEvent", () => {
	it("rounds dwell to whole ms", () => {
		const e = buildHotspotEvent(ctx, { hotspotId: "h1", dwellMs: 1234.7 });
		expect(e.dwellMs).toBe(1235);
	});

	it("floors a negative dwell at 0 — a clock change must not poison ranking", () => {
		const e = buildHotspotEvent(ctx, { hotspotId: "h1", dwellMs: -500 });
		expect(e.dwellMs).toBe(0);
	});
});

describe("buildActionTapEvent", () => {
	it("keeps the hotspot and the surface, so the >70% check can be per-room", () => {
		const e = buildActionTapEvent(ctx, {
			hotspotId: "h1",
			kind: "compare",
			surface: "tour",
		});
		expect([e.hotspotId, e.kind, e.surface]).toEqual(["h1", "compare", "tour"]);
	});
});

describe("buildSaveFeatureEvent", () => {
	it("records the label the buyer saw", () => {
		const e = buildSaveFeatureEvent(ctx, {
			hotspotId: "h1",
			feature: "Open island kitchen",
		});
		expect(e.feature).toBe("Open island kitchen");
	});
});

describe("buildDatapointFocusEvent", () => {
	it("carries the serialised focus key verbatim", () => {
		const e = buildDatapointFocusEvent(ctx, { focusKey: "poi:abc" });
		expect(e.focusKey).toBe("poi:abc");
	});
});

describe("buildEvidenceCitedEvent", () => {
	it("returns null for an empty citation list", () => {
		// An `evidence_cited` with [] cannot be told apart from "never rendered",
		// which is the one question this event exists to answer.
		expect(
			buildEvidenceCitedEvent(ctx, { stopId: "s0", evidenceIds: [] }),
		).toBeNull();
	});

	it("copies the ids rather than aliasing the caller's array", () => {
		const ids = ["a", "b"];
		const e = buildEvidenceCitedEvent(ctx, { stopId: "s0", evidenceIds: ids });
		ids.push("c");
		// A queued event is persisted and drained later; sharing the array would
		// let a later mutation rewrite history.
		expect(e?.evidenceIds).toEqual(["a", "b"]);
	});
});
