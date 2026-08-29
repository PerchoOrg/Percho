import { photoPublicUrl } from '@/lib/supabase/storage';
/**
 * One photograph per preference dimension, for the trade-off card's two doors.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The Two Doors face (2026-08-29) first borrowed each door's picture from a
 * pool row's `heroUrl`. The owner rejected that on device and was right: a
 * listing hero is a front-elevation shot, and no front elevation says "move-in
 * ready" — two of them side by side say nothing at all about the choice.
 *
 * The fix he asked for (2026-08-29): use the DETAIL photos. Every listing photo
 * may carry `ai_tags` from the vision tagger — `room_type` out of the
 * twelve-room vocabulary, plus a factual `caption` describing what is actually
 * in the frame. A kitchen photo under "Move-in ready" depicts the thing; the
 * tagger's own sentence ("Modern kitchen with white cabinetry, stainless
 * appliances, and center island") says it in words.
 *
 * ── The photo depicts the CONCEPT, not one home's claim ─────────────────────
 *
 * The obvious rule — "the photo must come from a listing that claims this dim"
 * — was measured against the live pool and fails: `entertaining` is claimed by
 * exactly ONE listing, while the pool holds 30 kitchen photos. A door showing a
 * kitchen under "Updated kitchen" is honest whether or not that particular home
 * also asserts the word in its prose, because the door is labelling a
 * DIMENSION, not making a claim about a house.
 *
 * So a claiming listing is a PREFERENCE, not a requirement. Ranking, in order:
 *   1. the photo's listing claims the dim,
 *   2. how well the room depicts it (`DIM_ROOMS` is ordered, best first),
 *   3. the tagger's own `hero_score`, then `quality`.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 *
 * Only six dims have a room that honestly depicts them. `schools`, `walkable`,
 * `trails`, `hip` and `nightlife` are about the PLACE, and no room inside a
 * house shows a place — those doors are lit by a community hero on the client
 * (a tour poster genuinely is a photograph of the neighbourhood) or not at all.
 * Mapping `hip` to `exterior` because a house is available would be exactly the
 * arbitrary picture this module was written to remove.
 *
 * Coverage measured 2026-08-29 over a live 40-listing pool: `backyard` is
 * tagged on TWO photos in the whole set, against 47 living / 30 kitchen / 29
 * exterior. So `outdoors` — the most photogenic dim on the card — is the one
 * most likely to come back empty here, and the card falls back to its unlit
 * field. The owner declined a tagger re-run for now; when one happens, this
 * module gets better with no code change.
 */
import type { DimKey } from '@percho/shared/types';

/**
 * Which room types depict which dimension, best first.
 *
 * Every entry is a room the vision tagger actually emits (`HOTSPOT_ROOMS` in
 * the mobile app is the same twelve-word vocabulary).
 */
const DIM_ROOMS: Partial<Record<DimKey, readonly string[]>> = {
  move_in: ['kitchen', 'bathroom'],
  space: ['living', 'basement', 'office'],
  outdoors: ['backyard', 'pool', 'balcony'],
  entertaining: ['kitchen', 'dining'],
  family: ['living', 'pool', 'backyard'],
  quiet: ['backyard', 'exterior'],
};

export interface DimPhoto {
  url: string;
  /** The tagger's factual sentence. Absent when it wrote none. */
  caption?: string;
}

/** A photo row as this module needs it — `ai_tags` already narrowed. */
export interface TaggedPhotoRow {
  listing_id: string;
  storage_path: string;
  ai_tags: unknown;
}

interface Tags {
  room_type?: string | null;
  caption?: string | null;
  quality?: number | null;
  hero_score?: number | null;
  usable?: boolean | null;
}

function readTags(raw: unknown): Tags | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Tags;
}

/** A caption is only worth printing when it is a real sentence, not a stub. */
function usableCaption(caption: string | null | undefined): string | undefined {
  const t = caption?.trim();
  if (!t || t.length < 12) return undefined;
  return t;
}

/**
 * Pick one photo per dimension.
 *
 * @param photos every ready photo row for the listings in this pool
 * @param dimsByListing which dims each listing's own prose asserts
 */
export function pickDimPhotos(
  photos: readonly TaggedPhotoRow[],
  dimsByListing: ReadonlyMap<string, readonly DimKey[]>,
): Partial<Record<DimKey, DimPhoto>> {
  const out: Partial<Record<DimKey, DimPhoto>> = {};

  for (const [dim, rooms] of Object.entries(DIM_ROOMS) as [DimKey, readonly string[]][]) {
    let best: { score: number; row: TaggedPhotoRow; tags: Tags } | null = null;

    for (const row of photos) {
      const tags = readTags(row.ai_tags);
      if (tags === null) continue;
      if (tags.usable === false) continue;

      const room = tags.room_type?.trim().toLowerCase();
      if (!room) continue;
      const roomRank = rooms.indexOf(room);
      if (roomRank === -1) continue;

      // 1000 for a claiming listing dwarfs every other term, so a claim always
      // wins; then room fit; then the tagger's own opinion of the frame.
      const claims = dimsByListing.get(row.listing_id)?.includes(dim) === true;
      const score =
        (claims ? 1000 : 0) +
        (rooms.length - roomRank) * 100 +
        (tags.hero_score ?? tags.quality ?? 0);

      if (best === null || score > best.score) best = { score, row, tags };
    }

    if (best !== null) {
      const caption = usableCaption(best.tags.caption);
      out[dim] = {
        url: photoPublicUrl(best.row.storage_path),
        ...(caption === undefined ? {} : { caption }),
      };
    }
  }

  return out;
}
