/**
 * Shared loader + card builder for a single-listing video/photo feed.
 *
 * Used by:
 *   - `/v/[agentSlug]/[listingSlug]` (public, published-only)
 *   - `/dashboard/listings/[id]/preview` (owner-only, any status)
 *
 * Extracted from the public listing page on 2026-06-17 so
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
  // set only for synthesised external (FMLS) agents.
  office?: string | null;
  isExternal?: boolean;
};

export type ListingForFeed = {
  id: string;
  slug: string;
  agent_id: string | null;
  community_id: string | null;
  address: string;
  city: string;
  state: string;
  zip?: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  description: string[] | null;
  status: string;
  // external attribution + provenance.
  external_agent_name?: string | null;
  external_agent_phone?: string | null;
  external_office?: string | null;
  source?: string | null;
  source_id?: string | null;
};

type Community = { id: string; name: string; description: string | null };
type ListingVideo = {
  id: string;
  cf_video_id: string | null;
  cf_video_id_landscape: string | null;
  external_url: string | null;
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
    .select('id, cf_video_id, cf_video_id_landscape, external_url, kind, title, sort_order')
    .eq('listing_id', listing.id)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })) as { data: ListingVideo[] | null };

  const communityVideos: CommunityVideo[] = [];
  let schools: School[] = [];
  let pois: Poi[] = [];

  // nearby videos are anchored to the listing, not
  // the community. Owner rule: "只看 listing 本身附近的 poi. 只要有 nearby
  // 视频就应该显示. 如果恰好这个 nearby video 在某个 neighbor 里 可以一并
  // 显示." So we always pull listing-scoped bucket videos, and additionally
  // union the covering community's videos (manual uploads + community-scoped
  // bucket generation) when the listing has one.
  const { data: listingBucketRows } = (await supabase
    .from('generated_videos')
    .select('id, cf_stream_uid, intent_bucket, narrative')
    .eq('listing_id', listing.id)
    .eq('scope', 'listing_intent_bucket')
    .eq('status', 'ready')) as {
    data: Array<{
      id: string;
      cf_stream_uid: string | null;
      intent_bucket: string | null;
      narrative: { title?: string; voiceover?: string } | null;
    }> | null;
  };
  const seenCfIds = new Set<string>();
  for (const r of listingBucketRows ?? []) {
    if (!r.cf_stream_uid || seenCfIds.has(r.cf_stream_uid)) continue;
    seenCfIds.add(r.cf_stream_uid);
    communityVideos.push({
      id: r.id,
      cf_video_id: r.cf_stream_uid,
      kind: 'poi',
      title: r.narrative?.title ?? null,
      category: null,
      school_id: null,
      poi_id: null,
    });
  }

  if (listing.community_id) {
    const cv = (await supabase
      .from('community_videos')
      .select('id, cf_video_id, kind, title, category, school_id, poi_id')
      .eq('community_id', listing.community_id)
      .eq('status', 'ready')
      .eq('visibility', 'public')
      // skip history renders (is_primary=false).
      .eq('is_primary', true)) as { data: CommunityVideo[] | null };
    for (const v of cv.data ?? []) {
      if (seenCfIds.has(v.cf_video_id)) continue;
      seenCfIds.add(v.cf_video_id);
      communityVideos.push(v);
    }

    const { data: communityBucketRows } = (await supabase
      .from('generated_videos')
      .select('id, cf_stream_uid, intent_bucket, narrative')
      .eq('community_id', listing.community_id)
      .eq('scope', 'community_intent_bucket')
      .eq('status', 'ready')) as {
      data: Array<{
        id: string;
        cf_stream_uid: string | null;
        intent_bucket: string | null;
        narrative: { title?: string; voiceover?: string } | null;
      }> | null;
    };
    for (const r of communityBucketRows ?? []) {
      if (!r.cf_stream_uid || seenCfIds.has(r.cf_stream_uid)) continue;
      seenCfIds.add(r.cf_stream_uid);
      communityVideos.push({
        id: r.id,
        cf_video_id: r.cf_stream_uid,
        kind: 'poi',
        title: r.narrative?.title ?? null,
        category: null,
        school_id: null,
        poi_id: null,
      });
    }

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
 * external listing loader — `/v/{source}/{sourceId}`.
 * Looks up an FMLS (or other externally-sourced) listing by its provenance
 * key.  Synthesises an in-memory `Agent` from `external_agent_name/phone/office`
 * so the downstream `buildListingCards` path can render identically to
 * agent-owned listings (with `isExternal=true` gating the caption card).
 */
export async function loadListingFeedBySource(
  source: string,
  sourceId: string,
  opts: { statuses?: string[] } = {},
): Promise<ListingFeedBundle | null> {
  const statuses = opts.statuses ?? ['active'];
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, community_id, address, city, state, zip, price, beds, baths, sqft, cover_url, description, status, external_agent_name, external_agent_phone, external_office, source, source_id',
    )
    .eq('source', source)
    .eq('source_id', sourceId)
    .in('status', statuses)
    .maybeSingle()) as { data: ListingForFeed | null };
  if (!listing) return null;

  const agent: Agent = {
    id: '',
    slug: '',
    name: listing.external_agent_name ?? 'FMLS Agent',
    email: null,
    phone: listing.external_agent_phone ?? null,
    office: listing.external_office ?? null,
    isExternal: true,
  };

  return fetchAroundListing(supabase, agent, listing);
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
      'id, slug, agent_id, community_id, address, city, state, zip, price, beds, baths, sqft, cover_url, description, status, external_agent_name, external_agent_phone, external_office, source, source_id',
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
export async function loadListingFeedById(listingId: string): Promise<ListingFeedBundle | null> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, community_id, address, city, state, zip, price, beds, baths, sqft, cover_url, description, status, external_agent_name, external_agent_phone, external_office, source, source_id',
    )
    .eq('id', listingId)
    .maybeSingle()) as { data: ListingForFeed | null };
  if (!listing) return null;

  // dashboard preview is Percho-agent only. External
  // listings (FMLS) have agent_id IS NULL and aren't editable via dashboard,
  // so bail if we land here.
  if (!listing.agent_id) return null;

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
  photos:
    | { id: string; storage_path: string; alt_text: string | null; sort_order: number }[]
    | null,
): Promise<BrowseCard[]> {
  const { agent, listing, listingVideos, communityVideos, schools, pois } = bundle;

  // categoryVideos are built the same way whether the
  // listing hero is a video or a photo. Nearby (listing- + community-scoped)
  // videos must render on photo-only listings too — hoisted out of the video
  // branch so the photo fallback stops hard-coding `[]`.
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
      categoryVideos,
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
        zip: (listing as any).zip ?? null,
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        sqft: listing.sqft,
        description: (listing.description ?? []).filter((s) => s && s.trim().length > 0),
        source: listing.source ?? null,
        sourceId: listing.source_id ?? null,
      },
      agent: {
        slug: agent.slug,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        office: agent.office ?? null,
        isExternal: agent.isExternal ?? false,
      },
    };
    return [photoCard];
  }

  const hero = listingVideos[0];
  if (!hero) return [];

  const heroVideos = listingVideos.map((v) => ({
    cfVideoId: v.cf_video_id ?? '',
    cfVideoIdLandscape: v.cf_video_id_landscape ?? null,
    externalUrl: v.external_url ?? null,
    line1: v.title ?? listing.address,
    line2: `${listing.city}, ${listing.state}`,
  }));

  const card: BrowseCard = {
    id: hero.cf_video_id ?? hero.cf_video_id_landscape ?? `ext:${hero.id}`,
    mediaKind: 'video',
    hero: {
      cfVideoId: hero.cf_video_id ?? hero.cf_video_id_landscape ?? '',
      cfVideoIdLandscape: hero.cf_video_id_landscape ?? null,
      externalUrl: hero.external_url ?? null,
    },
    heroVideos: heroVideos.length > 1 ? heroVideos : undefined,
    categoryVideos,
    listing: {
      id: listing.id,
      slug: listing.slug,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zip: (listing as any).zip ?? null,
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
