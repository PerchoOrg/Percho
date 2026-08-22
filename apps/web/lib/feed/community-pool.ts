/**
 * Community pool for the v3 feed's Stage 3 (spec-v3 `01-feed.md` §1.4).
 *
 * Fetched from `communities` DIRECTLY, not derived from listing rows. That
 * distinction is the whole point of this file: only 3 of 260 active listings
 * carry a `community_id`, so projecting communities out of the listing feed
 * yields an essentially empty Stage 3 — the stage that is supposed to be the
 * best-populated one (8680 real Nextdoor-seeded communities) and whose
 * right-swipes are the only way the 3→4 gate ever opens.
 *
 * CRITICAL: `boundary` must NOT be selected here. The Nextdoor seeds are dense
 * multipolygons and PostgREST hits `statement_timeout` (PG 57014) streaming
 * many of them at once — the trap documented in `lib/communities/list.ts`.
 * The feed card only needs a hero image; boundary is fetched per-card later.
 *
 * Every field is real or absent. A community with no usable cover image is
 * dropped rather than shown as a blank card, because §1.4 cards are
 * photo-first — a community card with no photo is not a card.
 */

import { publicCoverImageUrl } from '@/lib/communities/cover';
import type { TourSegment } from '@/lib/feed/tour-segments';
import { createAnonClient } from '@/lib/supabase/server';
import type { CardIconName } from '@percho/shared/icons';
import type { DimKey } from '@percho/shared/types';
import { communityHighlightDims } from './community-highlights';
import { type CommunityReason, communityReasons } from './community-reasons';
import { communityLifestyleSignals, signalIcon } from './community-signals';

/**
 * One lifestyle signal, and the glyph it wears.
 *
 * `icon` is optional and often absent: the shipped font is a 14-glyph subset
 * and "Lake nearby" / "Golf nearby" have no honest match in it. The card
 * renders the label with no glyph rather than borrowing a wrong one — see
 * `signalIcon` in `community-signals.ts`.
 */
export interface CommunitySignal {
  label: string;
  icon?: CardIconName;
}

export interface PoolCommunityDTO {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  heroUrl: string;
  blurb?: string;
  /**
   * The redline's three "community highlights" tiles, derived from the
   * Nextdoor-seeded `attributes` / `interests` columns — see
   * `community-highlights.ts`. Omitted (not `[]`) when the community has no
   * usable signal, so `CommunityFace` renders no tiles rather than empty ones.
   */
  dims?: DimKey[];
  /**
   * The three "why people love it" tiles — resident-stated `attributes`,
   * verbatim, each with a glyph and sometimes a factual sub-line. This is what
   * the card renders as of layout E (owner, 2026-08-02); `dims` above stays as
   * the fallback for the 9.4% of communities whose attributes yield no reason.
   *
   * Omitted (not `[]`) when empty, same convention as `dims`, so the card can
   * tell "no reasons" from "reasons not sent".
   */
  reasons?: CommunityReason[];
  /**
   * The chip row's 2-3 distinctive lifestyle signals, computed per community
   * by `community-signals.ts` (owner, 2026-08-15: no generic category words —
   * "Mature trees" / "3 parks nearby" / "Quiet streets", not Restaurants /
   * Walkability / Trees). Omitted when the community yields no usable signal.
   */
  signals?: CommunitySignal[];
  /**
   * 9:16 hero video, attached by the route from `generated_videos` (see
   * `lib/feed/vertical-videos.ts`). Absent for most communities: only 4 have a
   * ready vertical video today. `CommunityFace` already renders `CardVideo` when
   * this is present — the field simply did not exist before, so the mobile card
   * could never play one.
   */
  videoUrl?: string;
  /**
   * One entry per PLACE in the attached tour, so the card can draw its progress
   * as one dash per place instead of one continuous bar (owner 2026-08-22).
   * Attached by the route from `tour_assemblies`; absent whenever the video did
   * not come from an assembly, or came from one whose shot list is unreadable.
   */
  tourSegments?: TourSegment[];
}

type CommunityPoolRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  description: string | null;
  cover_storage_path: string | null;
  attributes: string[] | null;
  interests: string[] | null;
  /** Sub-fact sources for the reason tiles. Only ever used as evidence FOR the
   * reason they sit under — see `community-reasons.ts` `factFor`. */
  residents_count: number | null;
  homeowners_pct: number | null;
  /**
   * 91.1% populated. Cited only for age-shaped claims — see `factFor`.
   *
   * OPTIONAL, not `number | null`: making it required broke every existing test
   * fixture that predates this column, and `factFor` already treats a missing
   * value the same as a null one.
   */
  avg_age?: number | null;
};

/**
 * Communities for the pool, ordered by name for a deterministic page window.
 *
 * Scoped to the cities the buyer's funnel has actually narrowed to when the
 * client supplies them — Stage 3 follows Stage 2's city choices, so sending an
 * Atlanta buyer communities from Cumming would undo the narrowing the funnel
 * just did. With no cities supplied it returns an unscoped page (Stage 3 can be
 * reached with city signals that no longer resolve, e.g. after a scope reset).
 */
export async function fetchCommunityPool(args: {
  offset: number;
  limit: number;
  cities?: string[];
}): Promise<PoolCommunityDTO[]> {
  const supabase = await createAnonClient();

  let query = supabase
    .from('communities')
    // `attributes` / `interests` are small text[] columns (10 short values
    // each) — unlike `boundary` they are safe to stream for a whole page. They
    // feed the redline's three highlight tiles; see `community-highlights.ts`.
    // `residents_count` / `homeowners_pct` are two smallints; they are the only
    // two figures that qualify as evidence for a resident-stated reason (see
    // `community-reasons.ts`). Still no `boundary` — that is the timeout trap.
    .select(
      'id, slug, name, city, state, description, cover_storage_path, attributes, interests, residents_count, homeowners_pct, avg_age',
    )
    .eq('status', 'active')
    // A card with no photo is not a card (§1.4 is photo-first).
    .not('cover_storage_path', 'is', null);

  if (args.cities && args.cities.length > 0) {
    query = query.in('city', args.cities);
  }

  const { data, error } = await query
    .order('name', { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);

  if (error) throw new Error(`community pool fetch failed: ${error.message}`);

  const rows = (data ?? []) as CommunityPoolRow[];
  // One grouped read for the page, after the rows are known.
  const poiCounts = await fetchPoiCounts(
    supabase,
    rows.map((r) => r.id),
  );
  return projectCommunityPool(rows, poiCounts);
}

/**
 * Communities named by id, ignoring the name-ordered page window.
 *
 * `videoFirst` cannot be satisfied by SORTING the page — the same trap the route
 * already documents for listings, and the reason the owner saw no community
 * video in the iOS dev sampler (2026-08-02). The pool is ordered by `name` and
 * read as `offset=0, limit=12`; the only community with a ready video today is
 * **Ashley Crossing**, which is ~280th alphabetically. It was never in the page
 * to be hoisted. Sorting a page you have cannot surface a row you did not fetch.
 *
 * So the caller fetches these explicitly and prepends them. Same projection, so
 * a card built this way is indistinguishable from a paged one.
 */
export async function fetchCommunityPoolByIds(ids: string[]): Promise<PoolCommunityDTO[]> {
  if (ids.length === 0) return [];
  const supabase = await createAnonClient();
  const { data, error } = await supabase
    .from('communities')
    // Same column list as the paged read, minus `boundary` — see the header.
    .select(
      'id, slug, name, city, state, description, cover_storage_path, attributes, interests, residents_count, homeowners_pct, avg_age',
    )
    .eq('status', 'active')
    .not('cover_storage_path', 'is', null)
    .in('id', ids);

  // A failed read here must not take the feed down: this is a dev-only ordering
  // aid, and the funnel's real community page is fetched separately.
  if (error) {
    console.warn(
      '[feed] community-by-id fetch failed, serving the paged window only:',
      error.message,
    );
    return [];
  }
  const rows = (data ?? []) as CommunityPoolRow[];
  // Same counts as the paged read. Omitting them here would make a by-id card
  // (the dev sampler's path, and the owner's device) show WEAKER facts than the
  // identical card served from the page window.
  const poiCounts = await fetchPoiCounts(
    supabase,
    rows.map((r) => r.id),
  );
  return projectCommunityPool(rows, poiCounts);
}

/**
 * POI counts per community, keyed `communityId -> intent_bucket -> count`.
 *
 * One grouped read for the whole page rather than a query per card. Only
 * `approved`/`candidate` rows exist today and both are real places, so no status
 * filter — revisit if a `rejected` state appears.
 *
 * Returns an empty map on error: a missing count must degrade to the interest
 * and demographic facts, never fail the feed.
 */
export async function fetchPoiCounts(
  supabase: Awaited<ReturnType<typeof createAnonClient>>,
  communityIds: string[],
): Promise<Record<string, Record<string, number>>> {
  if (communityIds.length === 0) return {};
  const { data, error } = await supabase
    .from('community_pois')
    .select('community_id, intent_bucket')
    .in('community_id', communityIds);
  if (error || !data) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const row of data as { community_id: string; intent_bucket: string }[]) {
    if (!row.community_id || !row.intent_bucket) continue;
    let perCommunity = out[row.community_id];
    if (!perCommunity) {
      perCommunity = {};
      out[row.community_id] = perCommunity;
    }
    perCommunity[row.intent_bucket] = (perCommunity[row.intent_bucket] ?? 0) + 1;
  }
  return out;
}

/** Pure projection, exported for direct testing. */
export function projectCommunityPool(
  rows: CommunityPoolRow[],
  poiCounts: Record<string, Record<string, number>> = {},
): PoolCommunityDTO[] {
  const out: PoolCommunityDTO[] = [];
  for (const r of rows) {
    // Guarded again rather than trusting the query filter: this projection is
    // also reachable from tests and future callers.
    if (!r.cover_storage_path || !r.slug || !r.name) continue;
    const dims = communityHighlightDims({
      attributes: r.attributes,
      interests: r.interests,
    });
    // Layout E's tiles. Sent ALONGSIDE `dims` rather than instead of them: the
    // card prefers reasons and falls back to dims, and 9.4% of communities yield
    // no reason while still yielding a dim.
    const reasons = communityReasons({
      attributes: r.attributes,
      facts: {
        residentsCount: r.residents_count,
        homeownersPct: r.homeowners_pct,
        avgAge: r.avg_age,
        // Counts of real places — the strongest fact the card can show
        // (owner: 「图标里要有干货数据 比如33个餐厅」). Only 11.7% of communities
        // have any; see `poiCounts` in `community-reasons.ts` for the ceiling.
        poiCounts: poiCounts[r.id],
        // Evidence for a resident-stated reason, and the column that took
        // sub-fact coverage from 36.2% to 82.3% of cards — see
        // `community-reasons.ts` `INTEREST_EVIDENCE`.
        interests: r.interests,
      },
    });
    // The chip row's 2-3 lifestyle signals — distinct per community, and a
    // count ("33 restaurants") only when this community actually has one.
    const signals: CommunitySignal[] = communityLifestyleSignals(reasons).map((label) => {
      const icon = signalIcon(label);
      return icon ? { label, icon } : { label };
    });
    out.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city ?? '',
      state: r.state ?? '',
      heroUrl: publicCoverImageUrl(r.cover_storage_path),
      // Omitted rather than `[]` when there is no usable signal: the card must
      // render no tiles at all instead of three empty glass boxes.
      ...(dims.length > 0 ? { dims } : {}),
      ...(reasons.length > 0 ? { reasons } : {}),
      ...(signals.length > 0 ? { signals } : {}),
    });
  }
  return out;
}
