import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VideoFeed } from './_components/VideoFeed';
import type { FeedCard } from './_components/types';

/**
 * Public listing page — `/v/[agentSlug]/[listingSlug]`.
 *
 * Phase 3.3: vertical scroll-snap video feed UI (poster only — playback
 * lands in 3.4). Server Component fetches all data + ISR. Naive feed
 * composition (listing videos then community videos) — ARCH §5 interleave
 * is Phase 3.5.
 *
 * Data fetch order:
 *   agent (by slug)
 *   → listing (by agent_id + slug + status='published')
 *   → community (left, may be null)
 *   → listing_videos (status='ready', sorted)
 *   → community_videos (status='ready')
 *   → schools, pois (for community)
 *
 * Uses anon supabase client + RLS (Phase 0 schema grants public SELECT on
 * published listings + ready videos + communities/schools/pois).
 */

export const revalidate = 3600;

type PageParams = { agentSlug: string; listingSlug: string };

type Agent = { id: string; slug: string; name: string };
type Listing = {
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
  status: string;
};
type Community = { id: string; name: string; description: string | null };
type ListingVideo = { id: string; cf_video_id: string; kind: string; title: string | null };
type CommunityVideo = {
  id: string;
  cf_video_id: string;
  kind: string;
  title: string | null;
  school_id: string | null;
  poi_id: string | null;
};
type School = { id: string; name: string; grades: string | null; rating: number | null };
type Poi = { id: string; name: string; poi_type: string; distance_text: string | null };

async function fetchPageData(agentSlug: string, listingSlug: string) {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types — TODO(phase3-end): pnpm db:types regen
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name')
    .eq('slug', agentSlug)
    .maybeSingle()) as { data: Agent | null };
  if (!agent) return null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, community_id, address, city, state, price, beds, baths, sqft, cover_url, status',
    )
    .eq('agent_id', agent.id)
    .eq('slug', listingSlug)
    .eq('status', 'published')
    .maybeSingle()) as { data: Listing | null };
  if (!listing) return null;

  let community: Community | null = null;
  if (listing.community_id) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const res = (await (supabase as any)
      .from('communities')
      .select('id, name, description')
      .eq('id', listing.community_id)
      .maybeSingle()) as { data: Community | null };
    community = res.data;
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listingVideos } = (await (supabase as any)
    .from('listing_videos')
    .select('id, cf_video_id, kind, title')
    .eq('listing_id', listing.id)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })) as { data: ListingVideo[] | null };

  let communityVideos: CommunityVideo[] = [];
  let schools: School[] = [];
  let pois: Poi[] = [];
  if (listing.community_id) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const cv = (await (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, kind, title, school_id, poi_id')
      .eq('community_id', listing.community_id)
      .eq('status', 'ready')) as { data: CommunityVideo[] | null };
    communityVideos = cv.data ?? [];

    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const sc = (await (supabase as any)
      .from('schools')
      .select('id, name, grades, rating')
      .eq('community_id', listing.community_id)) as { data: School[] | null };
    schools = sc.data ?? [];

    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const po = (await (supabase as any)
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

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { agentSlug, listingSlug } = await params;
  const data = await fetchPageData(agentSlug, listingSlug);
  if (!data) return { title: 'Listing not found · Vicinity' };
  const { listing, agent, listingVideos } = data;

  const title = `${listing.address} · ${listing.city}, ${listing.state}`;
  const priceText = listing.price ? `$${listing.price.toLocaleString()}` : null;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const description = [priceText, specs, `Listed by ${agent.name}`].filter(Boolean).join(' — ');

  // Image priority: explicit cover_url → first listing_video thumbnail → none.
  // thumbnailUrl() throws if subdomain env not set; swallow so metadata still
  // renders without an image rather than 500-ing the whole page.
  let imageUrl: string | null = listing.cover_url ?? null;
  if (!imageUrl && listingVideos[0]) {
    try {
      imageUrl = thumbnailUrl(listingVideos[0].cf_video_id);
    } catch {
      imageUrl = null;
    }
  }

  const url = `/v/${agentSlug}/${listingSlug}`;
  const images = imageUrl ? [{ url: imageUrl, width: 1280, height: 720 }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Vicinity',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PublicListingPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { agentSlug, listingSlug } = await params;
  const data = await fetchPageData(agentSlug, listingSlug);
  if (!data) notFound();

  const { agent, listing, listingVideos, communityVideos } = data;

  // Naive concat — listing first, community after. ARCH §5 interleave is 3.5.
  const cards: FeedCard[] = [
    ...listingVideos.map(
      (v): FeedCard => ({
        id: v.id,
        cfVideoId: v.cf_video_id,
        source: 'listing',
        kind: v.kind,
        title: v.title,
      }),
    ),
    ...communityVideos.map(
      (v): FeedCard => ({
        id: v.id,
        cfVideoId: v.cf_video_id,
        source: 'community',
        kind: v.kind,
        title: v.title,
      }),
    ),
  ];

  return (
    <VideoFeed
      agent={{ slug: agent.slug, name: agent.name }}
      listing={{
        slug: listing.slug,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        sqft: listing.sqft,
      }}
      cards={cards}
    />
  );
}
