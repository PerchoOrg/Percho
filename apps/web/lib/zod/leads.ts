/**
 * Zod schemas for the leads API surface.
 *
 * Mirrors the `leads` table check constraint: at least one of email OR phone
 * must be present. Server route /api/leads parses every POST through
 * `LeadCreate` — Phase 5.2.
 *
 * Phase 45.18 (2026-06-20): leads now accept either a listing_id OR a
 * community_id (exactly one). Listing leads land with the listing's agent;
 * community leads land with the community's `created_by` agent.
 */
import { z } from 'zod';

// Loose phone match: 7+ digits, allows +, spaces, dashes, parens. Mirrors the
// client-side regex in LeadModal so client and server agree on the format.
const PHONE_RE = /^[\d+\-\s()]{7,}$/;

export const LeadCreate = z
  .object({
    listing_id: z.string().uuid().nullable().optional(),
    community_id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().regex(PHONE_RE).max(40).nullable().optional(),
    message: z.string().trim().max(2000).nullable().optional(),
    // Free-form provenance tag (e.g. "listing-page", utm). Bounded to keep
    // the analytics column from filling with 64KB blobs.
    source: z.string().trim().max(120).nullable().optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: 'email or phone required',
    path: ['email'],
  })
  .refine((d) => Boolean(d.listing_id) !== Boolean(d.community_id), {
    message: 'exactly one of listing_id or community_id',
    path: ['listing_id'],
  });

export type LeadCreate = z.infer<typeof LeadCreate>;
