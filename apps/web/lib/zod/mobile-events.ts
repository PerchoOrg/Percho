/**
 * Zod schema for POST /api/mobile/events — the mobile telemetry sink.
 *
 * The client (`apps/mobile/state/event-queue.ts`) drains one FIFO holding two
 * event streams, each a discriminated union that will keep growing. The
 * server deliberately does NOT re-model those unions: `type`/`seq`/`at` (+
 * optional `listingId`) are the envelope it indexes, the rest rides along in
 * `payload` jsonb. A new client event type must not require a server deploy
 * to avoid being dropped — that would silently bias the funnel data toward
 * old builds.
 *
 * Bounds are the point: batch ≤ 100 (the client cap is 500 total), type
 * length-capped, and the whole event size-capped so the jsonb column cannot
 * be used as blob storage by an abusive caller.
 */
import { z } from 'zod';

const MAX_EVENT_JSON_BYTES = 4096;

export const mobileEventSchema = z
  .object({
    type: z.string().trim().min(1).max(48),
    seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    /** Client clock, epoch ms. */
    at: z.number().int().positive().max(4102444800000), // year 2100 — rejects seconds-vs-ms mixups' far future
    listingId: z.string().uuid().optional(),
  })
  .passthrough()
  .refine((e) => JSON.stringify(e).length <= MAX_EVENT_JSON_BYTES, {
    message: 'event too large',
  });

export const mobileEventsPayloadSchema = z.object({
  installId: z.string().uuid(),
  events: z.array(mobileEventSchema).min(1).max(100),
});

export type MobileEventsPayload = z.infer<typeof mobileEventsPayloadSchema>;
