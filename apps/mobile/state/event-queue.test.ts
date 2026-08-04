/**
 * Event queue tests (§1.9 offline / §1.10 telemetry).
 *
 * The behaviours worth pinning are all failure-mode behaviours: the cap must
 * drop the OLDEST, a failed drain must not lose the batch, and a drain must not
 * discard events that arrived while it was in flight. Those are exactly the
 * bugs that would silently corrupt funnel conversion metrics.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScopeEvent } from "../lib/feed/events";
import {
	QUEUE_CAP,
	type QueuedEvent,
	capQueue,
	noopTransport,
	useEventQueue,
} from "./event-queue";

const q = () => useEventQueue.getState();

const ev = (seq: number): ScopeEvent => ({
	type: "swipe",
	seq,
	at: seq * 100,
	funnelStage: 1,
	sessionN: 1,
	cardId: `c${seq}`,
	cardType: "listing",
	verdict: "R",
	activeIndex: seq,
});

beforeEach(() => {
	useEventQueue.setState({
		queue: [],
		nextSeq: 1,
		draining: false,
		hydrated: false,
		transport: noopTransport,
	});
});

describe("capQueue — drop-oldest at the cap", () => {
	it("appends while under the cap", () => {
		expect(capQueue([ev(1)], ev(2)).map((e) => e.seq)).toEqual([1, 2]);
	});

	it("drops the oldest, not the newest, at the cap", () => {
		const full = Array.from({ length: 4 }, (_, i) => ev(i + 1));
		const next = capQueue(full, ev(5), 4);
		expect(next.map((e) => e.seq)).toEqual([2, 3, 4, 5]);
	});

	it("holds the real 500 cap", () => {
		let queue: QueuedEvent[] = [];
		for (let i = 1; i <= QUEUE_CAP + 10; i++) queue = capQueue(queue, ev(i));
		expect(queue.length).toBe(QUEUE_CAP);
		expect(queue[0]?.seq).toBe(11);
		expect(queue.at(-1)?.seq).toBe(QUEUE_CAP + 10);
	});
});

describe("takeSeq", () => {
	it("hands out monotonic ids", () => {
		expect([q().takeSeq(), q().takeSeq(), q().takeSeq()]).toEqual([1, 2, 3]);
		expect(q().nextSeq).toBe(4);
	});
});

describe("drain", () => {
	it("ships the batch and empties the queue", async () => {
		const transport = vi.fn<(batch: QueuedEvent[]) => Promise<boolean>>(
			async () => true,
		);
		q().setTransport(transport);
		q().enqueue(ev(1));
		q().enqueue(ev(2));

		expect(await q().drain()).toBe(2);
		expect(transport).toHaveBeenCalledOnce();
		expect(transport.mock.calls[0]?.[0].map((e) => e.seq)).toEqual([1, 2]);
		expect(q().queue).toEqual([]);
	});

	it("is a no-op on an empty queue", async () => {
		const transport = vi.fn(async () => true);
		q().setTransport(transport);
		expect(await q().drain()).toBe(0);
		expect(transport).not.toHaveBeenCalled();
	});

	// Offline is the normal case in §1.9, not an exception.
	it("keeps the batch when the transport reports failure", async () => {
		q().setTransport(async () => false);
		q().enqueue(ev(1));
		expect(await q().drain()).toBe(0);
		expect(q().queue.map((e) => e.seq)).toEqual([1]);
	});

	it("keeps the batch when the transport throws", async () => {
		q().setTransport(async () => {
			throw new Error("network down");
		});
		q().enqueue(ev(1));
		expect(await q().drain()).toBe(0);
		expect(q().queue.map((e) => e.seq)).toEqual([1]);
	});

	it("clears `draining` after a failure so the next drain can proceed", async () => {
		q().setTransport(async () => {
			throw new Error("network down");
		});
		q().enqueue(ev(1));
		await q().drain();
		expect(q().draining).toBe(false);

		q().setTransport(noopTransport);
		expect(await q().drain()).toBe(1);
	});

	// The bug this guards: `set({ queue: [] })` after an await would silently
	// discard every swipe made during the flight.
	it("preserves events enqueued while a drain is in flight", async () => {
		let release: (v: boolean) => void = () => {};
		q().setTransport(
			() =>
				new Promise<boolean>((resolve) => {
					release = resolve;
				}),
		);
		q().enqueue(ev(1));

		const inFlight = q().drain();
		q().enqueue(ev(2)); // arrives mid-flight
		release(true);

		expect(await inFlight).toBe(1);
		expect(q().queue.map((e) => e.seq)).toEqual([2]);
	});

	it("refuses a concurrent second drain", async () => {
		let release: (v: boolean) => void = () => {};
		const transport = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					release = resolve;
				}),
		);
		q().setTransport(transport);
		q().enqueue(ev(1));

		const first = q().drain();
		expect(await q().drain()).toBe(0); // rejected while in flight
		release(true);
		await first;
		expect(transport).toHaveBeenCalledOnce();
	});
});

describe("task-1 sink", () => {
	it("noopTransport accepts, so the drain path stays exercised", async () => {
		q().enqueue(ev(1));
		expect(await q().drain()).toBe(1);
		expect(q().queue).toEqual([]);
	});
});
