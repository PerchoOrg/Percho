/**
 * Zod schemas for API boundaries.
 *
 * Every Route Handler that accepts a JSON body MUST parse it through one
 * of these schemas. TypeScript types are not runtime checks.
 */
import { z } from 'zod';

// ─── Listings ────────────────────────────────────────────────────
export const ListingStatus = z.enum(['draft', 'published', 'archived']);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const ListingCreate = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers, hyphens'),
  address: z.string().min(5).max(200),
  city: z.string().min(1).max(80),
  state: z.string().length(2).default('GA'),
  zip: z.string().max(10).optional(),
  neighborhood: z.string().max(120).optional(),
  community_id: z.string().uuid().optional(),
  price: z.number().int().positive().optional(),
  beds: z.number().nonnegative().optional(),
  baths: z.number().nonnegative().optional(),
  sqft: z.number().int().positive().optional(),
  year_built: z.number().int().min(1800).max(2100).optional(),
  lot_size: z.string().max(40).optional(),
  hoa: z.string().max(80).optional(),
  style: z.string().max(80).optional(),
  description: z.array(z.string().max(2000)).max(10).default([]),
});
export type ListingCreate = z.infer<typeof ListingCreate>;

export const ListingUpdate = ListingCreate.partial().extend({
  status: ListingStatus.optional(),
});
export type ListingUpdate = z.infer<typeof ListingUpdate>;

// ─── Videos ──────────────────────────────────────────────────────
export const VideoCreateUpload = z.object({
  scope: z.enum(['listing', 'community']),
  parent_id: z.string().uuid(),
  kind: z.string().min(1).max(40),
  title: z.string().max(120).optional(),
  upload_length: z.number().int().positive().max(2 * 1024 * 1024 * 1024), // 2 GB cap
});
export type VideoCreateUpload = z.infer<typeof VideoCreateUpload>;

// ─── Leads ───────────────────────────────────────────────────────
export const LeadCreate = z
  .object({
    listing_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    email: z.string().email().optional(),
    phone: z.string().min(7).max(40).optional(),
    message: z.string().max(2000).optional(),
    source: z.string().max(200).optional(),
  })
  .refine((v) => v.email || v.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });
export type LeadCreate = z.infer<typeof LeadCreate>;

// ─── Schools / POIs (manual entry, audit-mandatory fields) ───────
export const SchoolCreate = z.object({
  community_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  grades: z.string().max(20).optional(),
  rating: z.number().min(0).max(10).optional(),
  source_url: z.string().url(),
});
export type SchoolCreate = z.infer<typeof SchoolCreate>;

export const PoiCreate = z.object({
  community_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  poi_type: z.enum(['restaurant', 'park', 'grocery', 'gym', 'shopping', 'transit', 'other']),
  distance_text: z.string().max(40).optional(),
  source_url: z.string().url(),
});
export type PoiCreate = z.infer<typeof PoiCreate>;

// ─── Events ──────────────────────────────────────────────────────
export const EventInsert = z.object({
  listing_id: z.string().uuid().optional(),
  event_type: z.enum([
    'page_view',
    'card_view',
    'lead_submit',
    'share',
    'video_complete',
    'video_progress',
  ]),
  card_type: z.enum(['home', 'school', 'poi', 'neighborhood']).optional(),
  card_id: z.string().max(80).optional(),
  source: z.string().max(200).optional(),
  session_id: z.string().max(80).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type EventInsert = z.infer<typeof EventInsert>;
