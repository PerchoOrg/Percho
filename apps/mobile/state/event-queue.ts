/**
 * §1.10 telemetry sink — an AsyncStorage-persisted FIFO with a hard cap.
 *
 * Why a queue at all: §1.9 requires the feed to work offline, and telemetry is
 * a *derived sink* of the same swipe callback that drives signals — not a
 * parallel mechanism. Events therefore have to survive an offline stretch and a
 * cold restart, then drain in order when the network returns.
 *
 * Cap is 500, drop-OLDEST. The §1.10 health metrics are funnel conversion
 * rates, so recent behaviour is what matters; an unbounded queue on a device
 * offline for a week grows without limit, and dropping *newest* would freeze
 * the funnel view at the moment of saturation.
 *
 * `transport` is injected. Task-1's is a no-op sink because
 * `buyer_scope_events` / `/api/mobile/events` do not exist yet (see the
 * `events.ts` header). Swapping in a real POST is a one-line change and needs
 * no test rewrite.
 *
 * ONE QUEUE, TWO STREAMS (task-2). §2.6's `listing_explore_events` shares this
 * queue with §1.10's `buyer_scope_events`, because offline durability, ordering
 * and the drop-oldest cap are properties of the DEVICE, not of a table. The
 * transport is what routes: every event carries a discriminating `type`, and
 * `listingId` is present on exactly the explore ones. Two parallel queues would
 * mean two caps, two drains, and an interleaving that no longer reflects what
 * the buyer actually did.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ScopeEvent } from "../lib/feed/events";
import type { ExploreEvent } from "../lib/listing/explore-events";

/** Anything the device queues. Discriminated by `type` at the transport. */
export type QueuedEvent = ScopeEvent | ExploreEvent;

export const QUEUE_CAP = 500;

/**
 * Ships a batch. Must resolve true only when the batch is durably accepted —
 * false or a throw leaves the batch queued for the next drain.
 */
export type EventTransport = (batch: QueuedEvent[]) => Promise<boolean>;

/** Task-1 sink: accepts and discards. Keeps the drain path exercised. */
export const noopTransport: EventTransport = async () => true;

/** Pure cap policy, exported so the drop-oldest rule is directly testable. */
export function capQueue(
	queue: readonly QueuedEvent[],
	incoming: QueuedEvent,
	cap: number = QUEUE_CAP,
): QueuedEvent[] {
	const next = [...queue, incoming];
	return next.length <= cap ? next : next.slice(next.length - cap);
}

interface EventQueueState {
	queue: readonly QueuedEvent[];
	hydrated: boolean;
	/** Monotonic per-install counter backing `ScopeEvent.seq`. */
	nextSeq: number;
	/** True while a drain is in flight, so two drains cannot double-send. */
	draining: boolean;
	transport: EventTransport;

	setTransport: (t: EventTransport) => void;
	/** Reserve the next seq. Callers pass it into the `build*Event` helpers. */
	takeSeq: () => number;
	enqueue: (event: QueuedEvent) => void;
	/** Ship everything queued. Returns the number of events accepted. */
	drain: () => Promise<number>;
	clear: () => void;
}

export const useEventQueue = create<EventQueueState>()(
	persist(
		(set, get) => ({
			queue: [],
			hydrated: false,
			nextSeq: 1,
			draining: false,
			transport: noopTransport,

			setTransport: (transport) => set({ transport }),

			takeSeq: () => {
				const seq = get().nextSeq;
				set({ nextSeq: seq + 1 });
				return seq;
			},

			enqueue: (event) => set((s) => ({ queue: capQueue(s.queue, event) })),

			drain: async () => {
				const { queue, transport, draining } = get();
				if (draining || queue.length === 0) return 0;
				const batch = [...queue];
				set({ draining: true });
				try {
					const ok = await transport(batch);
					if (!ok) return 0;
					// Re-read from the store rather than assigning []: events
					// enqueued *during* the flight must survive the drain.
					set((s) => ({ queue: s.queue.slice(batch.length) }));
					return batch.length;
				} catch {
					// Offline / server error: keep the batch for the next drain.
					return 0;
				} finally {
					set({ draining: false });
				}
			},

			clear: () => set({ queue: [] }),
		}),
		{
			name: "percho-v3:event-queue:v1",
			storage: createJSONStorage(() => AsyncStorage),
			// `transport` is a function and `draining` is in-flight state —
			// neither is serializable nor meaningful across a restart.
			partialize: (s) => ({ queue: s.queue, nextSeq: s.nextSeq }),
			onRehydrateStorage: () => () => {
				useEventQueue.setState({ hydrated: true, draining: false });
			},
		},
	),
);
