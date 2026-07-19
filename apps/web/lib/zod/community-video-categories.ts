/**
 * Community video categories — Phase 22 (2026-06-14).
 *
 * Replaces the old 3-value `kind` axis (school | poi | neighborhood) with 12
 * categories split across two buckets:
 *
 *   Bucket A — "Only on Percho":
 *     scarce content nobody else has. The product moat.
 *
 *   Bucket B — "Real look at the data":
 *     other platforms have the data layer (GreatSchools / Yelp / Strava heatmaps).
 *     We add the visceral video layer agents have always recorded but never had
 *     anywhere good to put.
 *
 * Each entry carries:
 *   - id           : DB enum string (snake_case, matches migration 0017)
 *   - bucket       : 'a' | 'b' (matches the generated column in the DB)
 *   - label        : short UI title (English; product is English-only)
 *   - blurb        : one-liner shown under the label in the picker
 *   - hardRule     : bullet about what the video MUST contain (anti-fluff guardrail)
 *
 * The hard-rule strings are the *spec*. Enforcement happens incrementally:
 *   - Phase 22 ships: shown to the agent in the picker, no automated check.
 *   - Future: light client-side checks (duration, mute, dashcam frame detection).
 *
 * IMPORTANT: this file is the single source of truth for categories. The DB
 * migration constraint, the picker UI, and the public grid all read from here.
 * If you add/rename a category: update migration AND this file in the same PR.
 */
import { z } from 'zod';

export const COMMUNITY_VIDEO_CATEGORIES = [
  // ─── Bucket A — Only on Percho ────────────────────────────────
  {
    id: 'walk_the_block',
    bucket: 'a',
    label: 'Walk the Block',
    blurb: 'A real, unedited walk through the streets',
    hardRule: '≥3 minutes continuous, no cuts.',
  },
  {
    id: 'listen_here',
    bucket: 'a',
    label: 'Listen Here',
    blurb: 'What this place sounds like',
    hardRule: 'Hold still ≥30 seconds, no narration.',
  },
  {
    id: 'morning_rush',
    bucket: 'a',
    label: 'Morning Rush',
    blurb: 'The commute, on a real weekday',
    hardRule: 'Dashcam timestamp must be visible.',
  },
  {
    id: 'after_dark',
    bucket: 'a',
    label: 'After Dark',
    blurb: 'How the area feels at night',
    hardRule: 'Capture time visible on screen.',
  },
  {
    id: 'hidden_spot',
    bucket: 'a',
    label: 'Hidden Spot',
    blurb: 'Locals-only places worth knowing',
    hardRule: 'Show route from this neighborhood to the spot.',
  },
  {
    id: 'local_pick',
    bucket: 'a',
    label: 'Local Pick',
    blurb: 'A non-chain place residents actually go',
    hardRule: 'No national chains (Costco, Starbucks, Chipotle, etc.).',
  },
  // ─── Bucket B — Real look at the data ───────────────────────────
  {
    id: 'school_run',
    bucket: 'b',
    label: 'School Run',
    blurb: 'The drive to the assigned schools',
    hardRule: 'Show route from this neighborhood to the school.',
  },
  {
    id: 'daily_errands',
    bucket: 'b',
    label: 'Daily Errands',
    blurb: 'Grocery, pharmacy, the boring real stuff',
    hardRule: 'Show route from this neighborhood.',
  },
  {
    id: 'the_park',
    bucket: 'b',
    label: 'The Park',
    blurb: 'The neighborhood park, on the ground',
    hardRule: 'Show route from this neighborhood.',
  },
  {
    id: 'eating_out',
    bucket: 'b',
    label: 'Eating Out',
    blurb: 'Where you actually go for dinner',
    hardRule: 'Show route from this neighborhood.',
  },
  {
    id: 'get_active',
    bucket: 'b',
    label: 'Get Active',
    blurb: 'Trails, gyms, courts, fields',
    hardRule: 'Show route from this neighborhood.',
  },
  {
    id: 'transit_reality',
    bucket: 'b',
    label: 'Transit Reality',
    blurb: 'Bus stop, train, ride share — what actually works',
    hardRule: 'Show route from this neighborhood.',
  },
] as const;

export type CommunityVideoCategoryMeta = (typeof COMMUNITY_VIDEO_CATEGORIES)[number];
export type CommunityVideoCategoryId = CommunityVideoCategoryMeta['id'];
export type CommunityVideoBucket = 'a' | 'b';

export const COMMUNITY_VIDEO_CATEGORY_IDS = COMMUNITY_VIDEO_CATEGORIES.map(
  (c) => c.id,
) as readonly CommunityVideoCategoryId[];

/** Zod enum, kept in sync with the DB CHECK constraint in 0017. */
export const CommunityVideoCategory = z.enum(
  COMMUNITY_VIDEO_CATEGORY_IDS as unknown as [
    CommunityVideoCategoryId,
    ...CommunityVideoCategoryId[],
  ],
);

/** Lookup helper — never returns undefined for a valid id. */
export function getCategoryMeta(id: CommunityVideoCategoryId): CommunityVideoCategoryMeta {
  const meta = COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === id);
  if (!meta) throw new Error(`unknown community video category: ${id}`);
  return meta;
}

export function categoryBucket(id: CommunityVideoCategoryId): CommunityVideoBucket {
  return getCategoryMeta(id).bucket;
}

/**
 * Map a new 12-category id back to the legacy 3-value `kind`.
 * Needed only while the DB still has the `kind not null check` from 0001;
 * once we drop `kind` (post-Phase 22) this helper goes too.
 */
export function legacyKindForCategory(
  id: CommunityVideoCategoryId,
): 'school' | 'poi' | 'neighborhood' {
  switch (id) {
    case 'school_run':
      return 'school';
    case 'walk_the_block':
    case 'listen_here':
    case 'morning_rush':
    case 'after_dark':
      return 'neighborhood';
    default:
      return 'poi';
  }
}

/**
 * Reverse map: legacy `kind` → conservative default category.
 * Mirrors the UPDATE in migration 0017. Used by the route handler when an
 * older client posts only `kind`.
 */
export function categoryForLegacyKind(kind: 'school' | 'poi' | 'neighborhood'): {
  category: CommunityVideoCategoryId;
  needsReview: boolean;
} {
  switch (kind) {
    case 'school':
      return { category: 'school_run', needsReview: false };
    case 'neighborhood':
      return { category: 'walk_the_block', needsReview: false };
    case 'poi':
      return { category: 'eating_out', needsReview: true };
  }
}
