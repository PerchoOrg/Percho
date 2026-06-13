import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VideoFeed } from './_components/VideoFeed';

/**
 * Public listing page — `/v/[agentSlug]/[listingSlug]`.
 *
 * 2026-06-11 (parity hotfix): now reuses `/browse`'s `BrowseFeed` so the
 * right rail (Like / Schools / Nearby / Area / Sound / Share / Contact) is
 * identical to discovery. Single listing → single `BrowseCard`, with
 * walkthroughs exposed via `heroVideos`.
 *
 * Data fetch: agent (incl. email/phone for Contact fallback) → listing →
 * community → listing_videos → community_videos → schools → pois.
 *
 * Uses anon supabase client + RLS (Phase 0 schema grants public SELECT on
 * published listings + ready videos + communities/schools/pois).
 */

export const revalidate = 3600;

type PageParams = { agentSlug: string; listingSlug: string };

type Agent = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
};
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
    .select('id, cf_video_id, kind, title, sort_order')
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

const NEIGHBORHOOD_DESC_MAX = 80;
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export default async function PublicListingPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { agentSlug, listingSlug } = await params;
  const data = await fetchPageData(agentSlug, listingSlug);
  if (!data) notFound();

  const { agent, listing, listingVideos, communityVideos, schools, pois, community } = data;

  if (listingVideos.length === 0) {
    // No hero video. Phase 10 (2026-06-12): if the listing has photos,
    // render a minimal photo gallery so photo-only listings have a
    // detail page; otherwise fall back to the VideoFeed empty state.
    const supabase = await createClient();
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: photoRows } = (await (supabase as any)
      .from('listing_photos')
      .select('id, storage_path, alt_text, sort_order')
      .eq('listing_id', listing.id)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })
      .then(
        (r: unknown) => r as { data: unknown },
        // Hotfix (2026-06-12): migration 0011 may not be applied — fall through
        // to the existing video-empty-state below.
        () => ({ data: [] }),
      )) as {
      data:
        | { id: string; storage_path: string; alt_text: string | null; sort_order: number }[]
        | null;
    };
    const photos = photoRows ?? [];
    if (photos.length > 0) {
      const { photoPublicUrl } = await import('@/lib/supabase/storage');
      return (
        <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
          <div className="mx-auto max-w-3xl px-4 py-6">
            <h1 className="font-serif text-2xl">{listing.address}</h1>
            <p className="text-cream/70 text-sm">
              {listing.city}, {listing.state}
            </p>
            <div className="mt-2 text-cream/80 text-sm">
              {listing.price != null ? `$${listing.price.toLocaleString()}` : 'Price on request'}
              {listing.beds != null && listing.baths != null
                ? ` · ${listing.beds} bd · ${listing.baths} ba`
                : ''}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {photos.map((p) => (
                // Cross-origin Supabase asset.
                <img
                  key={p.id}
                  src={photoPublicUrl(p.storage_path)}
                  alt={p.alt_text ?? listing.address}
                  loading="lazy"
                  className="w-full rounded border border-bronze/20 object-cover"
                />
              ))}
            </div>
            <div className="mt-8 rounded border border-bronze/30 bg-ink2 p-4 text-cream/70 text-xs">
              Listed by {agent.name}.
            </div>
          </div>
        </main>
      );
    }
    return <VideoFeed listingId={listing.id} cards={[]} />;
  }

  const hero = listingVideos[0];
  if (!hero) {
    // Defensive — `listingVideos.length === 0` is handled above; this
    // satisfies noUncheckedIndexedAccess without `!`.
    notFound();
  }

  // Multi-walkthrough listings: expose extras via heroVideos pool so users
  // can horizontal-swipe / re-tap Hero source on the rail.
  const heroVideos = listingVideos.map((v) => ({
    cfVideoId: v.cf_video_id,
    line1: v.title ?? listing.address,
    line2: `${listing.city}, ${listing.state}`,
  }));

  const schoolsById = new Map(schools.map((s) => [s.id, s] as const));
  const poisById = new Map(pois.map((p) => [p.id, p] as const));

  const schoolVideos = communityVideos
    .filter((v) => v.kind.toUpperCase() === 'SCHOOL')
    .map((v) => {
      const s = v.school_id ? schoolsById.get(v.school_id) : undefined;
      return {
        cfVideoId: v.cf_video_id,
        line1: s ? `${s.name}${s.grades ? ` ${s.grades}` : ''}` : (v.title ?? 'School'),
        line2: s?.rating != null ? `${s.rating}/10` : undefined,
      };
    });

  const nearbyVideos = communityVideos
    .filter((v) => v.kind.toUpperCase() === 'POI')
    .map((v) => {
      const p = v.poi_id ? poisById.get(v.poi_id) : undefined;
      return {
        cfVideoId: v.cf_video_id,
        line1: p?.name ?? v.title ?? 'Nearby',
        line2: p?.distance_text ?? undefined,
      };
    });

  const neighborhoodVideos = communityVideos
    .filter((v) => v.kind.toUpperCase() === 'NEIGHBORHOOD')
    .map((v) => ({
      cfVideoId: v.cf_video_id,
      line1: community?.name ?? v.title ?? 'Neighborhood',
      line2: community?.description
        ? truncate(community.description, NEIGHBORHOOD_DESC_MAX)
        : undefined,
    }));

  const card: BrowseCard = {
    id: hero.cf_video_id,
    mediaKind: 'video',
    hero: { cfVideoId: hero.cf_video_id },
    heroVideos: heroVideos.length > 1 ? heroVideos : undefined,
    schoolVideos,
    nearbyVideos,
    communityVideos: neighborhoodVideos,
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

  return <VideoFeed listingId={listing.id} cards={[card]} />;
}
