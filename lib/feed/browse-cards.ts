/**
 * Shared server-side fetcher for browse cards.
 *
 * Both `/browse` (grid) and `/browse/feed` (swipe) call this to assemble
 * a list of `BrowseCard` rows from Supabase. Lifted out of the previous
 * `app/(public)/browse/page.tsx` (where it lived inline) so the grid
 * page and feed page share a single source of truth.
 *
 * Phase 9 (2026-06-12): grid-first browse pivot. Card type extended with
 * `description` (joined from `listings.description text[]`) so the swipe
 * feed can render a longer caption at the bottom (Xiaohongshu-style).
 *
 * Phase 14 (2026-06-13): `/nearby` reuses the same card shape via
 * `fetchNearbyCards({ lat, lng, radius })` so the Nearby grid is visually
 * identical to Explore (Pinterest-style, click → swipe feed). Distance is
 * the only additive, optional field on the returned card.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { haversineMiles, latLngBoundingBox } from '@/lib/geo/distance';
import { createClient } from '@/lib/supabase/server';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';

const FEED_LIMIT = 30;
const NEARBY_MAX_ROWS = 200;

type ListingRow = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  description: string[] | null;
  community_id: string | null;
  agent_id: string;
  // Phase 60 (2026-06-26): cover_url joins the projection so the grid
  // thumbnail can honour the agent's "Set as cover" pick (photo or
  // video) regardless of mediaKind.
  cover_url: string | null;
  lat?: number | null;
  lng?: number | null;
};

type AgentRow = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ListingVideoRow = {
  listing_id: string;
  cf_video_id: string;
  title: string | null;
  kind: string;
  sort_order: number;
};

type ListingPhotoRow = {
  listing_id: string;
  storage_path: string;
  sort_order: number;
};

type CommunityVideoRow = {
  community_id: string;
  cf_video_id: string;
  title: string | null;
  kind: string;
  category: string | null;
  school_id: string | null;
  poi_id: string | null;
};

type SchoolRow = {
  community_id: string;
  id: string;
  name: string;
  grades: string | null;
  rating: number | null;
};

type PoiRow = {
  community_id: string;
  id: string;
  name: string;
  distance_text: string | null;
};

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  state: string | null;
};

/**
 * Internal helper: given a pre-filtered batch of listings, fan out the
 * joined queries (agents, videos, photos, community context) and assemble
 * `BrowseCard[]`. Distance is passed in by the caller (`/nearby` only —
 * `/browse` passes `undefined`).
 *
 * Phase 14: extracted from `fetchBrowseCards()` so `fetchNearbyCards()`
 * can reuse the join + assembly without duplicating ~150 LOC.
 */
async function assembleCards(
  listings: ListingRow[],
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  supabase: any,
  distanceById?: Map<string, number>,
): Promise<BrowseCard[]> {
  if (listings.length === 0) return [];

  const listingIds = listings.map((l) => l.id);
  const agentIds = Array.from(new Set(listings.map((l) => l.agent_id)));
  const communityIds = Array.from(
    new Set(listings.map((l) => l.community_id).filter((x): x is string => !!x)),
  );

  const [
    listingVidsResp,
    listingPhotosResp,
    agentsResp,
    commVidsResp,
    schoolsResp,
    poisResp,
    communitiesResp,
    listingCountResp,
  ] = await Promise.all([
    supabase
      .from('listing_videos')
      .select('listing_id, cf_video_id, title, kind, sort_order')
      .in('listing_id', listingIds)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true }),
    // Phase 10: photos parallel for photo-only fallback. If migration 0011
    // hasn't run yet, supabase-js returns { data: null, error } rather than
    // throwing — `.then` second arg is belt-and-suspenders against future
    // client revisions that throw.
    supabase
      .from('listing_photos')
      .select('listing_id, storage_path, sort_order')
      .in('listing_id', listingIds)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })
      .then(
        (r: { data: ListingPhotoRow[] | null }) => r,
        () => ({ data: [] }),
      ),
    supabase.from('agents').select('id, slug, name, email, phone').in('id', agentIds),
    communityIds.length > 0
      ? supabase
          .from('community_videos')
          .select('community_id, cf_video_id, title, kind, category, school_id, poi_id')
          .in('community_id', communityIds)
          .eq('status', 'ready')
          .eq('visibility', 'public')
      : Promise.resolve({ data: [] }),
    communityIds.length > 0
      ? supabase
          .from('schools')
          .select('community_id, id, name, grades, rating')
          .in('community_id', communityIds)
      : Promise.resolve({ data: [] }),
    communityIds.length > 0
      ? supabase
          .from('pois')
          .select('community_id, id, name, distance_text')
          .in('community_id', communityIds)
      : Promise.resolve({ data: [] }),
    communityIds.length > 0
      ? supabase
          .from('communities')
          .select('id, name, slug, description, city, state')
          .in('id', communityIds)
          .eq('status', 'active')
      : Promise.resolve({ data: [] }),
    // Phase 34b (V1 redo): listingCount per community for the sheet header.
    // Counts ALL published listings, not just the ones in this card batch —
    // the user opens the sheet expecting "homes in this community", not
    // "homes in current page".
    communityIds.length > 0
      ? supabase
          .from('listings')
          .select('community_id')
          .in('community_id', communityIds)
          .eq('status', 'active')
      : Promise.resolve({ data: [] }),
  ]);

  const listingVideos = (listingVidsResp.data ?? []) as ListingVideoRow[];
  const listingPhotos = (listingPhotosResp.data ?? []) as ListingPhotoRow[];
  const agents = (agentsResp.data ?? []) as AgentRow[];
  const commVideos = (commVidsResp.data ?? []) as CommunityVideoRow[];
  const schools = (schoolsResp.data ?? []) as SchoolRow[];
  const pois = (poisResp.data ?? []) as PoiRow[];
  const communities = (communitiesResp.data ?? []) as CommunityRow[];
  const listingCountRows = (listingCountResp.data ?? []) as Array<{ community_id: string }>;
  const listingCountByCommunity = new Map<string, number>();
  for (const row of listingCountRows) {
    listingCountByCommunity.set(
      row.community_id,
      (listingCountByCommunity.get(row.community_id) ?? 0) + 1,
    );
  }

  const heroByListing = new Map<string, ListingVideoRow>();
  for (const v of listingVideos) {
    if (!heroByListing.has(v.listing_id)) heroByListing.set(v.listing_id, v);
  }
  const heroPhotoByListing = new Map<string, ListingPhotoRow>();
  for (const p of listingPhotos) {
    if (!heroPhotoByListing.has(p.listing_id)) heroPhotoByListing.set(p.listing_id, p);
  }
  const agentsById = new Map(agents.map((a) => [a.id, a] as const));
  const communitiesById = new Map(communities.map((c) => [c.id, c] as const));
  const _schoolsById = new Map(schools.map((s) => [s.id, s] as const));
  const _poisById = new Map(pois.map((p) => [p.id, p] as const));

  const commVidsByCommunity = new Map<string, CommunityVideoRow[]>();
  for (const v of commVideos) {
    const arr = commVidsByCommunity.get(v.community_id) ?? [];
    arr.push(v);
    commVidsByCommunity.set(v.community_id, arr);
  }

  const { photoPublicUrl } = await import('@/lib/supabase/storage');

  const cards: BrowseCard[] = [];
  for (const l of listings) {
    const hero = heroByListing.get(l.id);
    const heroPhoto = heroPhotoByListing.get(l.id);
    const agent = agentsById.get(l.agent_id);
    if (!agent) continue;
    if (!hero && !heroPhoto) continue;

    const community = l.community_id ? (communitiesById.get(l.community_id) ?? null) : null;
    const cVids = l.community_id ? (commVidsByCommunity.get(l.community_id) ?? []) : [];

    const categoryMetaById = new Map(COMMUNITY_VIDEO_CATEGORIES.map((m) => [m.id, m] as const));

    /**
     * Phase 28 (2026-06-14): single Nearby pool. Merges the old
     * schools / pois / neighborhood splits into one feed of community
     * videos, each tagged with its 12-category metadata. The right rail
     * has a single "Nearby" entry; tapping it enters this pool, and
     * each video's category label + blurb is shown as a pill above the
     * caption (read on the client from COMMUNITY_VIDEO_CATEGORIES).
     *
     * Backward-compat: if a row has no `category` (pre-Phase 22 data),
     * we synthesise one from the legacy `kind` so the pool stays
     * non-empty for older listings.
     */
    const categoryVideos = cVids.map((v) => {
      let categoryId: CommunityVideoCategoryId | null = null;
      if (v.category && categoryMetaById.has(v.category as CommunityVideoCategoryId)) {
        categoryId = v.category as CommunityVideoCategoryId;
      } else {
        // Legacy fallback — mirrors categoryForLegacyKind(): never null.
        switch (v.kind.toUpperCase()) {
          case 'SCHOOL':
            categoryId = 'school_run';
            break;
          case 'NEIGHBORHOOD':
            categoryId = 'walk_the_block';
            break;
          default:
            categoryId = 'eating_out';
        }
      }
      const meta = categoryMetaById.get(categoryId);
      // line1 = category label (e.g. "School Run"), line2 = blurb. The
      // overlay-pill on the client reads category from the meta lookup
      // again so it can render a different shape if we want — line1/2
      // also keep the existing source-overlay code path working.
      return {
        cfVideoId: v.cf_video_id,
        line1: meta?.label ?? v.title ?? 'Nearby',
        line2: meta?.blurb,
        category: categoryId,
      };
    });

    const card: BrowseCard = {
      id: hero ? hero.cf_video_id : `photo:${l.id}`,
      mediaKind: hero ? 'video' : 'photo',
      hero: { cfVideoId: hero?.cf_video_id ?? '' },
      heroPhotoUrl: hero ? undefined : photoPublicUrl((heroPhoto as ListingPhotoRow).storage_path),
      // Phase 60 (2026-06-26): grid thumbnail honours the agent's
      // explicit `cover_url`. Grid consumers prefer this over the
      // mediaKind-derived hero. We fall through to undefined when
      // cover_url is null so callers default to the existing
      // mediaKind branch (no behavioural change for un-set covers).
      gridCoverUrl: l.cover_url ?? undefined,
      categoryVideos,
      listing: {
        id: l.id,
        slug: l.slug,
        address: l.address,
        city: l.city,
        state: l.state,
        price: l.price,
        beds: l.beds,
        baths: l.baths,
        sqft: l.sqft,
        description: (l.description ?? []).filter((s) => s && s.trim().length > 0),
      },
      agent: {
        slug: agent.slug,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
      },
    };
    if (community) {
      // Phase 34b (V1 redo): surface community on the card so BrowseFeed
      // can render a top-left chip; tapping the chip opens CommunitySheet
      // (L1) — does NOT navigate. videoCount is the fan-out community-video
      // pool size and seeds the sheet's "COMMUNITY VIDEOS · N" header.
      card.community = {
        slug: community.slug,
        name: community.name,
        city: community.city,
        state: community.state ?? '',
        description: community.description,
        videoCount: cVids.length,
        listingCount: listingCountByCommunity.get(community.id) ?? 0,
      };
    }
    if (distanceById?.has(l.id)) {
      card.distance = distanceById.get(l.id);
    }
    cards.push(card);
  }
  return cards;
}

export async function fetchBrowseCards(): Promise<BrowseCard[]> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, price, beds, baths, sqft, description, community_id, agent_id, cover_url',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT)) as { data: ListingRow[] | null };

  const listings = rawListings ?? [];
  return assembleCards(listings, supabase);
}

/**
 * Phase 27.4 (2026-06-16): community-scoped browse feed. Used when the
 * buyer taps a tile on `/c/[slug]` — they should land in a swipe feed
 * filtered to active listings inside that single community. We resolve
 * the community by slug, then fan out the same join as the global
 * fetcher so every BrowseCard renders identically (right-rail Nearby
 * pool, agent card, etc.). Returns [] for unknown slug — the caller
 * falls back to global feed.
 */
export async function fetchBrowseCardsByCommunitySlug(
  slug: string,
): Promise<BrowseCard[]> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()) as { data: { id: string } | null };
  if (!community) return [];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, price, beds, baths, sqft, description, community_id, agent_id, cover_url',
    )
    .eq('status', 'active')
    .eq('community_id', community.id)
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT)) as { data: ListingRow[] | null };

  return assembleCards(rawListings ?? [], supabase);
}

/**
 * Phase 21 (2026-06-13): fetch BrowseCards for a specific id set,
 * preserving the input order. Used by `/saved` to render the buyer's
 * saved listings via the same grid card shape as `/browse`. Filters
 * out non-published listings (e.g. archived after save).
 */
export async function fetchBrowseCardsByIds(ids: string[]): Promise<BrowseCard[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, price, beds, baths, sqft, description, community_id, agent_id, cover_url',
    )
    .in('id', ids)
    .eq('status', 'active')) as { data: ListingRow[] | null };

  const cards = await assembleCards(rawListings ?? [], supabase);
  // Preserve caller order (saves are sorted newest-first).
  const byId = new Map(cards.map((c) => [c.listing.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is BrowseCard => Boolean(c));
}

/**
 * Phase 14: nearby-aware cards. bbox prefilter (b-tree on lat/lng) +
 * exact haversine in JS, sorted ascending by distance. Returns the same
 * `BrowseCard` shape as `fetchBrowseCards()` so the grid renders
 * identically; an additive `distance` field is attached for the overlay
 * line. Resilient to migration 0011 not being applied (try/catch on the
 * lat/lng query).
 */
export async function fetchNearbyCards(args: {
  lat: number;
  lng: number;
  radius: number;
}): Promise<BrowseCard[]> {
  const supabase = await createClient();
  const bbox = latLngBoundingBox(args.lat, args.lng, args.radius);

  let raw: ListingRow[] = [];
  try {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const r = (await (supabase as any)
      .from('listings')
      .select(
        'id, slug, address, city, state, price, beds, baths, sqft, description, community_id, agent_id, cover_url, lat, lng',
      )
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', bbox.minLat)
      .lte('lat', bbox.maxLat)
      .gte('lng', bbox.minLng)
      .lte('lng', bbox.maxLng)
      .limit(NEARBY_MAX_ROWS)) as { data: ListingRow[] | null };
    raw = r.data ?? [];
  } catch {
    raw = [];
  }

  const center = { lat: args.lat, lng: args.lng };
  const withDistance = raw
    .filter(
      (l): l is ListingRow & { lat: number; lng: number } =>
        typeof l.lat === 'number' && typeof l.lng === 'number',
    )
    .map((l) => ({
      row: l as ListingRow,
      distance: haversineMiles(center, { lat: l.lat, lng: l.lng }),
    }))
    .filter((x) => x.distance <= args.radius)
    .sort((a, b) => a.distance - b.distance);

  const distanceById = new Map(withDistance.map((x) => [x.row.id, x.distance] as const));
  const ordered = withDistance.map((x) => x.row);
  const cards = await assembleCards(ordered, supabase, distanceById);
  // `assembleCards` preserves input order → cards already sorted by distance.
  return cards;
}
