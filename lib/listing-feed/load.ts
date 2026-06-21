/**
 * Shared loader + card builder for a single-listing video/photo feed.
 *
 * Used by:
 *   - `/v/[agentSlug]/[listingSlug]` (public, published-only)
 *   - `/dashboard/listings/[id]/preview` (owner-only, any status)
 *
 * Extracted from the public listing page on 2026-06-17 (Phase 27.10) so
 * draft / archived previews can reuse the exact BrowseFeed render path.
 *
 * Two entry points:
 *   - `loadListingFeedBySlug(agentSlug, listingSlug, { statuses })` — public
 *     page; default `statuses=['active']` keeps existing behavior.
 *   - `loadListingFeedById(listingId)` — dashboard preview; ignores status,
 *     RLS already scopes to the calling agent's own rows.
 *
 * Both return either `null` (404 candidate) or `{ listing, cards }` ready
 * to feed `<VideoFeed listingId={...} cards={...} />`.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { createClient } from '@/lib/supabase/server';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';

type Agent = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type ListingForFeed = {
  id: string;
  slug: string;
  agent_id: string;
  community_id: string | null;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  description: string[] | null;
  status: string;
};

type Community = { id: string; name: string; description: string | null };
type ListingVideo = {
  id: string;
  cf_video_id: string;
  kind: string;
  title: string | null;
  sort_order: number;
};
type CommunityVideo = {
  id: string;
  cf_video_id: string;
  kind: string;
  title: string | null;
  category: string | null;
  school_id: string | null;
  poi_id: string | null;
};
type School = { id: string; name: string; grades: string | null; rating: number | null };
type Poi = { id: string; name: string; poi_type: string; distance_text: string | null };

export interface ListingFeedBundle {
  agent: Agent;
  listing: ListingForFeed;
  community: Community | null;
  listingVideos: ListingVideo[];
  communityVideos: CommunityVideo[];
  schools: School[];
  pois: Poi[];
}

async function fetchAroundListing(
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  supabase: any,
  agent: Agent,
  listing: ListingForFeed,
): Promise<ListingFeedBundle> {
  let community: Community | null = null;
  if (listing.community_id) {
    const res = (await supabase
      .from('communities')
      .select('id, name, description')
      .eq('id', listing.community_id)
      .maybeSingle()) as { data: Community | null };
    community = res.data;
  }

  const { data: listingVideos } = (await supabase
    .from('listing_videos')
    .select('id, cf_video_id, kind, title, sort_order')
    .eq('listing_id', listing.id)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })) as { data: ListingVideo[] | null };

  let communityVideos: CommunityVideo[] = [];
  let schools: School[] = [];
  let pois: Poi[] = [];
  if (listing.community_id) {
    const cv = (await supabase
      .from('community_videos')
      .select('id, cf_video_id, kind, title, category, school_id, poi_id')
      .eq('community_id', listing.community_id)
      .eq('status', 'ready')
      .eq('visibility', 'public')) as { data: CommunityVideo[] | null };
    communityVideos = cv.data ?? [];

    const sc = (await supabase
      .from('schools')
      .select('id, name, grades, rating')
      .eq('community_id', listing.community_id)) as { data: School[] | null };
    schools = sc.data ?? [];

    const po = (await supabase
      .from('pois')
      .select('id, name, poi_type, distance_text')
      .eq('community_id', listing.community_id)) as { data: Poi[] | null };
    pois = po.data ?? [];
  }

  return {
    agent,
    listing,
    community,
    listingVideos: listingVideos ?? [],
    communityVideos,
    schools,
    pois,
  };
}

/**
 * Public-page entry. Loads agent → listing (filtered by status) → related
 * data. Returns null if any of agent/listing not found.
 */
export async function loadListingFeedBySlug(
  agentSlug: string,
  listingSlug: string,
  opts: { statuses?: string[] } = {},
): Promise<ListingFeedBundle | null> {
  const statuses = opts.statuses ?? ['active'];
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name, email, phone')
    .eq('slug', agentSlug)
    .maybeSingle()) as { data: Agent | null };
  if (!agent) return null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, community_id, address, city, state, price, beds, baths, sqft, cover_url, description, status',
    )
    .eq('agent_id', agent.id)
    .eq('slug', listingSlug)
    .in('status', statuses)
    .maybeSingle()) as { data: ListingForFeed | null };
  if (!listing) return null;

  return fetchAroundListing(supabase, agent, listing);
}

/**
 * Dashboard preview entry. Ignores status (RLS scopes to owner's listings).
 * Joins agent through the listing.
 */
export async function loadListingFeedById(
  listingId: string,
): Promise<ListingFeedBundle | null> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, community_id, address, city, state, price, beds, baths, sqft, cover_url, description, status',
    )
    .eq('id', listingId)
    .maybeSingle()) as { data: ListingForFeed | null };
  if (!listing) return null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name, email, phone')
    .eq('id', listing.agent_id)
    .maybeSingle()) as { data: Agent | null };
  if (!agent) return null;

  return fetchAroundListing(supabase, agent, listing);
}

/**
 * Build the BrowseCard array for a loaded bundle. Returns `[]` when there
 * are no hero videos AND no photos — caller renders an empty state.
 *
 * Photo fallback (no hero video) requires an extra query, so we accept it
 * pre-fetched. Pass `photos: null` to skip the photo-fallback branch.
 */
export async function buildListingCards(
  bundle: ListingFeedBundle,
  photos: { id: string; storage_path: string; alt_text: string | null; sort_order: number }[] | null,
): Promise<BrowseCard[]> {
  const { agent, listing, listingVideos, communityVideos, schools, pois } = bundle;

  if (listingVideos.length === 0) {
    if (!photos || photos.length === 0) return [];
    const { photoPublicUrl } = await import('@/lib/supabase/storage');
    const heroStoragePath = photos[0]?.storage_path;
    if (!heroStoragePath) return [];
    const photoCard: BrowseCard = {
      id: `photo:${listing.id}`,
      mediaKind: 'photo',
      hero: { cfVideoId: '' },
      heroPhotoUrl: photoPublicUrl(heroStoragePath),
      photos: photos.map((p) => photoPublicUrl(p.storage_path)),
      categoryVideos: [],
      photoSchools: schools.map((s) => ({
        name: s.name,
        grades: s.grades,
        rating: s.rating,
      })),
      photoPois: pois.map((p) => ({ name: p.name, distance_text: p.distance_text })),
      listing: {
        id: listing.id,
        slug: listing.slug,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        sqft: listing.sqft,
        description: (listing.description ?? []).filter((s) => s && s.trim().length > 0),
      },
      agent: {
        slug: agent.slug,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
      },
    };
    return [photoCard];
  }

  const hero = listingVideos[0];
  if (!hero) return [];

  const heroVideos = listingVideos.map((v) => ({
    cfVideoId: v.cf_video_id,
    line1: v.title ?? listing.address,
    line2: `${listing.city}, ${listing.state}`,
  }));

  const categoryMetaById = new Map(COMMUNITY_VIDEO_CATEGORIES.map((m) => [m.id, m] as const));
  const categoryVideos = communityVideos.map((v) => {
    let categoryId: CommunityVideoCategoryId | null = null;
    if (v.category && categoryMetaById.has(v.category as CommunityVideoCategoryId)) {
      categoryId = v.category as CommunityVideoCategoryId;
    } else {
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
    return {
      cfVideoId: v.cf_video_id,
      line1: meta?.label ?? v.title ?? 'Nearby',
      line2: meta?.blurb,
      category: categoryId,
    };
  });

  const card: BrowseCard = {
    id: hero.cf_video_id,
    mediaKind: 'video',
    hero: { cfVideoId: hero.cf_video_id },
    heroVideos: heroVideos.length > 1 ? heroVideos : undefined,
    categoryVideos,
    listing: {
      id: listing.id,
      slug: listing.slug,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      description: (listing.description ?? []).filter((s) => s && s.trim().length > 0),
    },
    agent: {
      slug: agent.slug,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
    },
  };

  return [card];
}

/**
 * Helper: load listing_photos for the photo-fallback branch. Tolerates the
 * pre-migration-0011 case (table missing) by returning [].
 */
export async function loadListingPhotos(listingId: string) {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('listing_photos')
    .select('id, storage_path, alt_text, sort_order')
    .eq('listing_id', listingId)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })
    .then(
      (r: unknown) => r as { data: unknown },
      () => ({ data: [] }),
    )) as {
    data:
      | { id: string; storage_path: string; alt_text: string | null; sort_order: number }[]
      | null;
  };
  return data ?? [];
}
