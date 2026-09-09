/**
 * Shared model for /api/events (bulk behavioral-event insert).
 *
 * Kept OUT of the route file because Next.js 14's route contract rejects any
 * export from app/api/**\/route.ts that is not an HTTP method or route config.
 * `ClientEvent` / `eventRow` are exported here for tests; the route imports
 * them and only exports POST / runtime.
 */

import type { Json } from '@/lib/supabase/database.types';
import { z } from 'zod';

// Either listing_id OR community_id must be present, never both. zod
// has no native "exactly one of" so we union two strict shapes.
const ClientEventBase = z.object({
  event_type: z.enum(['page_view', 'card_view', 'video_complete']),
  card_id: z.string().max(80).optional(),
  session_id: z.string().min(1).max(80),
  meta: z.record(z.unknown()).optional(),
});

const ClientEventListing = ClientEventBase.extend({
  listing_id: z.string().uuid(),
  community_id: z.undefined().optional(),
});

const ClientEventCommunity = ClientEventBase.extend({
  community_id: z.string().uuid(),
  listing_id: z.undefined().optional(),
});

export const ClientEvent = z.union([ClientEventListing, ClientEventCommunity]);

export const ClientEventPayload = z.object({
  events: z.array(ClientEvent).min(1).max(100),
});

/**
 * One validated client event as the row `events` stores.
 *
 * Exported so the mapping can be tested without a request. The two things it
 * gets right are both easy to get wrong from reading the schema:
 *
 * `?? null`, not `'listing_id' in e`. Both union members DECLARE the other key
 * — as `z.undefined().optional()` — so `in` is true for a community event that
 * sent `listing_id: undefined` explicitly, and the row went out carrying
 * `undefined` rather than `null`. The column is nullable; absent and
 * explicitly-undefined are the same to it, and this says so.
 *
 * `meta` is asserted to `Json` because zod gives `Record<string, unknown>` —
 * `z.unknown()` says nothing about serialisability — while the value came out
 * of `req.json()` and so IS json. The assertion states that provenance rather
 * than suppressing the check, which is why it sits on this one field and not on
 * the client, where it used to.
 */
export function eventRow(e: z.infer<typeof ClientEvent>) {
  return {
    event_type: e.event_type,
    listing_id: e.listing_id ?? null,
    community_id: e.community_id ?? null,
    card_id: e.card_id ?? null,
    session_id: e.session_id,
    meta: (e.meta ?? null) as Json | null,
  };
}
