/**
 * POI content pipeline types.
 *
 * Hand-written companion to `lib/supabase/database.types.ts` for the tables
 * introduced in `20260714000000_poi_content_pipeline.sql`. When the user
 * regenerates database.types.ts (needs SUPABASE_ACCESS_TOKEN via
 * `supabase gen types typescript --linked`), replace these with the generated
 * Row/Insert/Update triples and re-export.
 *
 * See docs/pipelines/poi-content.md §3 for schema semantics.
 */

// ─── enums (mirrored in DB check constraints) ───────────────────────────────

/**
 * Buyer-persona intent buckets. Ordered by UI priority (owner spec,
 * 2026-07-15). Schools sits first because in GA suburbia it's the #1
 * decision driver even though it has thin Google Places photo coverage.
 * S+A photo-tier buckets follow (positions 2-8), then B-tier, then
 * C-tier (healthcare/pets/transit) — the last three use alternate data
 * sources (info cards / Mapbox animations) rather than Places photos.
 */
export const INTENT_BUCKETS = [
  'schools',
  'dining',
  'nightlife',
  'shopping',
  'outdoor',
  'fitness',
  'kids',
  'asian_community',
  'daily_errands',
  'faith',
  'work_hubs',
  'healthcare',
  'pets',
  'transit',
] as const;
export type IntentBucket = (typeof INTENT_BUCKETS)[number];

/**
 * Human-readable label for a Google Places `primary_type` / `types[]` value.
 *
 * Used by the caption pipeline to render "Public High School" /
 * "Southern Bistro" / "Neighborhood Park" instead of the bucket label.
 * Callers pass a POI's `primary_type` first, then fall back through `types[]`
 * in order (Places returns most-specific first). If nothing matches, callers
 * should fall back to the bucket label — do NOT invent a generic label here.
 *
 * The keys must stay lowercase-with-underscores (Places API convention).
 * Only include types that appear in `BUCKET_PLACES_TYPES` or that Google
 * commonly returns as a `types[]` companion to those (e.g. `food`, `store`).
 * We deliberately skip generic `point_of_interest` / `establishment` — those
 * would defeat the fallback and produce meaningless labels.
 */
export const POI_TYPE_LABEL: Record<string, string> = {
  // schools bucket
  primary_school: 'Elementary School',
  secondary_school: 'High School',
  school: 'School',
  university: 'University',
  // dining bucket
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bakery: 'Bakery',
  meal_takeaway: 'Takeout',
  meal_delivery: 'Delivery',
  // nightlife bucket
  bar: 'Bar',
  night_club: 'Nightclub',
  movie_theater: 'Movie Theater',
  // shopping bucket
  shopping_mall: 'Shopping Mall',
  department_store: 'Department Store',
  clothing_store: 'Clothing Store',
  // outdoor bucket
  park: 'Park',
  campground: 'Campground',
  tourist_attraction: 'Attraction',
  // fitness bucket
  gym: 'Gym',
  spa: 'Spa',
  // kids bucket
  amusement_park: 'Amusement Park',
  aquarium: 'Aquarium',
  zoo: 'Zoo',
  library: 'Library',
  // daily_errands bucket
  supermarket: 'Supermarket',
  grocery_store: 'Grocery Store',
  pharmacy: 'Pharmacy',
  convenience_store: 'Convenience Store',
  // faith bucket
  church: 'Church',
  mosque: 'Mosque',
  synagogue: 'Synagogue',
  hindu_temple: 'Hindu Temple',
  // healthcare bucket
  hospital: 'Hospital',
  doctor: 'Doctor',
  dentist: 'Dentist',
  // pets bucket
  veterinary_care: 'Veterinary Clinic',
  pet_store: 'Pet Store',
  // transit bucket
  subway_station: 'Subway Station',
  train_station: 'Train Station',
  transit_station: 'Transit Station',
  airport: 'Airport',
  bus_station: 'Bus Station',
};

/**
 * Given a POI's `primary_type` and `types[]` (both from Google Places),
 * return the most-specific human label, or `null` if nothing matches. The
 * caller is responsible for the bucket-label fallback.
 */
export function poiTypeLabel(
  primaryType: string | null | undefined,
  types: string[] | null | undefined,
): string | null {
  if (primaryType && POI_TYPE_LABEL[primaryType]) return POI_TYPE_LABEL[primaryType];
  for (const t of types ?? []) {
    if (POI_TYPE_LABEL[t]) return POI_TYPE_LABEL[t];
  }
  return null;
}

export const POI_STATUSES = ['candidate', 'approved', 'rejected', 'archived'] as const;
export type PoiStatus = (typeof POI_STATUSES)[number];

export const PHOTO_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const PHOTO_SOURCES = ['google_places', 'google_streetview'] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

export const TIME_BUCKETS = ['morning_peak', 'midday', 'evening_peak', 'weekend_noon'] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export const REVIEW_ENTITY_TYPES = [
  'listing_poi',
  'listing_poi_photo',
  'tag',
  'narrative',
  'video',
] as const;
export type ReviewEntityType = (typeof REVIEW_ENTITY_TYPES)[number];

export const REVIEW_ACTIONS = [
  'approve',
  'reject',
  'edit_tag',
  'edit_narrative',
  'reorder',
  'comment',
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const VIDEO_SCOPES = ['poi', 'intent_bucket', 'listing'] as const;
export type VideoScope = (typeof VIDEO_SCOPES)[number];

export const VIDEO_STATUSES = [
  'pending',
  'processing',
  'ready',
  'approved',
  'rejected',
  'failed',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

// ─── row types ──────────────────────────────────────────────────────────────

export type Poi = {
  id: string;
  google_place_id: string;
  display_name: string;
  formatted_address: string | null;
  primary_type: string | null;
  types: string[] | null;
  rating: number | null;
  user_ratings_total: number | null;
  business_status: string | null;
  /** Postgres `point` — Supabase serializes as `(lng,lat)` string. */
  location: string | null;
  raw_place: Record<string, unknown> | null;
  ai_tags: PoiAiTags | null;
  ai_summary: string | null;
  ai_model: string | null;
  discovered_at: string;
  refreshed_at: string;
  tagged_at: string | null;
};

export type ListingPoi = {
  listing_id: string;
  poi_id: string;
  intent_bucket: IntentBucket;
  distance_m: number | null;
  drive_time_s: number | null;
  status: PoiStatus;
  ai_score: number | null;
  discovered_at: string;
  reviewed_at: string | null;
};

export type PoiPhoto = {
  id: string;
  poi_id: string;
  source: PhotoSource;
  google_photo_name: string | null;
  storage_path: string;
  width_px: number | null;
  height_px: number | null;
  bytes: number | null;
  attribution: GooglePhotoAttribution | null;
  ai_tags: PhotoAiTags | null;
  ai_score: number | null;
  ai_model: string | null;
  created_at: string;
  tagged_at: string | null;
};

export type ListingPoiPhoto = {
  listing_id: string;
  poi_photo_id: string;
  status: PhotoStatus;
  reviewed_at: string | null;
};

export type PoiTraffic = {
  id: string;
  listing_id: string;
  poi_id: string | null;
  destination_label: string | null;
  time_bucket: TimeBucket;
  duration_free_s: number | null;
  duration_actual_s: number | null;
  congestion_ratio: number | null;
  fetched_at: string;
};

export type ReviewEvent = {
  id: number;
  listing_id: string;
  entity_type: ReviewEntityType;
  entity_ref: Record<string, unknown>;
  action: ReviewAction;
  reason_tags: string[] | null;
  human_note: string | null;
  ai_prediction: Record<string, unknown> | null;
  human_value: Record<string, unknown> | null;
  reviewer_id: string | null;
  created_at: string;
};

export type GeneratedVideo = {
  id: string;
  listing_id: string;
  scope: VideoScope;
  scope_id: string | null;
  intent_bucket: IntentBucket | null;
  cf_stream_uid: string | null;
  duration_s: number | null;
  aspect_ratio: string;
  input_photo_ids: string[] | null;
  narrative: Record<string, unknown> | null;
  generator: string | null;
  status: VideoStatus;
  error: string | null;
  created_at: string;
  reviewed_at: string | null;
};

// ─── nested payload shapes (jsonb columns) ──────────────────────────────────

export type GooglePhotoAttribution = {
  authorAttributions?: Array<{
    displayName?: string;
    uri?: string;
    photoUri?: string;
  }>;
};

/** Claude vision output on a POI as a whole (aggregated tags). */
export type PoiAiTags = {
  vibes?: string[];
  demographics?: string[];
  season?: string[];
  usable_for_video?: boolean;
  reason?: string;
};

/** Claude vision output on a single photo. */
export type PhotoAiTags = {
  scene?: string; // e.g. "storefront", "interior", "landscape"
  mood?: string;
  subjects?: string[];
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown';
  usable_for_video?: boolean;
  reason?: string;
};

// ─── review reason enums (client-visible, mirrored in review-reasons.ts) ────

export const POI_REJECT_REASONS = [
  'too-far',
  'wrong-vibe',
  'commercial-noise',
  'not-representative',
  'duplicate-of',
  'low-quality',
  'wrong-demographic',
  'chain-not-local',
  'other',
] as const;
export type PoiRejectReason = (typeof POI_REJECT_REASONS)[number];

export const PHOTO_REJECT_REASONS = [
  'storefront-only',
  'empty-parking-lot',
  'night-blurry',
  'no-people',
  'wrong-season',
  'logo-heavy',
  'duplicate',
  'low-res',
  'other',
] as const;
export type PhotoRejectReason = (typeof PHOTO_REJECT_REASONS)[number];
