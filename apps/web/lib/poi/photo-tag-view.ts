/**
 * Normalise the two photo tables' `ai_tags` blobs into the columns the admin
 * photo table renders.
 *
 * `listing_photos.ai_tags` and `poi_photos.ai_tags` are both free-form jsonb
 * written by different taggers, so the keys differ:
 *
 *   listing (photo_tagger.py)  {caption, room_type, quality, hero_score, usable,
 *                               is_master, time_of_day, style_signals[], notes}
 *   poi     (vision-tagger.ts) {description, primary_category, tags[], mood,
 *                               usable, reason}
 *
 * Rather than teach the table component about both shapes, both are projected
 * here. Everything is defensive: these blobs are model output, ~50% of rows have
 * no tags at all, and a missing key must render as "—" not crash a page.
 */

type Json = Record<string, unknown> | null | undefined;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
}

export interface PhotoTagView {
  /** Room type (listing) or primary category (POI). The row's "what is this". */
  category: string | null;
  /** One-line AI description. `caption` on listing rows, `description` on POI. */
  description: string | null;
  /** Free-form tag chips. */
  tags: string[];
  /** 0-1 usefulness, distinct from the top-level `ai_score`. */
  quality: number | null;
  /** 0-1 "would make a good opening shot" (listing only). */
  heroScore: number | null;
  /** Tagger's own verdict. `false` means the model said don't use this. */
  usable: boolean | null;
  /** Listing only: the primary bedroom. */
  isMaster: boolean;
}

export function projectTags(aiTags: Json): PhotoTagView {
  const t = (aiTags ?? {}) as Record<string, unknown>;

  return {
    category: str(t.room_type) ?? str(t.primary_category),
    description: str(t.caption) ?? str(t.description) ?? str(t.notes) ?? str(t.reason),
    tags: [
      ...strArray(t.tags),
      ...strArray(t.style_signals),
      ...(str(t.time_of_day) ? [str(t.time_of_day) as string] : []),
      ...(str(t.mood) ? [str(t.mood) as string] : []),
    ],
    quality: num(t.quality),
    heroScore: num(t.hero_score),
    usable: typeof t.usable === 'boolean' ? t.usable : null,
    isMaster: t.is_master === true,
  };
}

/**
 * Resolution verdict for the "Size" column.
 *
 * 1600 is the floor because the mobile card crops to 1080 and ken-burns
 * upscales 4x internally before zoompan (see percho-video-pipeline skill): below
 * ~1600 the pan visibly softens. `null` when the row never recorded dimensions.
 */
export function resolutionWarning(w: number | null, h: number | null): 'low' | 'ok' | null {
  if (!w || !h) return null;
  return Math.max(w, h) < 1600 ? 'low' : 'ok';
}
