/**
 * /c/[slug]/feed — buyer-facing community video swipe feed (Phase 27.7).
 *
 * Pure community-video feed: vertical swipe through every video that
 * belongs to this community (primary + extra memberships via the
 * community_video_membership view). No listing context, no agent CTA.
 * Save / Like target the community itself — the buyer is bookmarking
 * the neighborhood as a place to look for homes inside.
 *
 * `?start=<videoId>` — jump to a specific video (used when the buyer
 * taps a tile on `/c/[slug]`).
 */

import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { photoPublicUrl } from '@/lib/supabase/storage';
import {
  CommunityVideoFeed,
  type CommunityFeedVideo,
  type CommunityListingItem,
} from './CommunityVideoFeed';

export const dynamic = 'force-dynamic';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
}

interface VideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
  created_at: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Vicinity`,
    description: 'Swipe through the neighborhood — schools, walks, food.',
  };
}

export default async function CommunityFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { slug } = await params;
  const { start } = await searchParams;
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state')
    .eq('slug', slug)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) notFound();

  // Membership view: primary community_id UNION extra links.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('video_id')
    .eq('community_id', community.id)) as { data: Array<{ video_id: string }> | null };

  const videoIds = (memberships ?? []).map((m) => m.video_id);

  let videos: VideoRow[] = [];
  if (videoIds.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: rows } = (await (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, title, category, created_at')
      .in('id', videoIds)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })) as { data: VideoRow[] | null };
    videos = rows ?? [];
  }

  const feedVideos: CommunityFeedVideo[] = videos.map((v) => ({
    id: v.id,
    cfVideoId: v.cf_video_id,
    title: v.title,
    category: v.category,
  }));

  // Phase 27.6 (2026-06-17): right-rail "View N listings" button on the
  // feed needs an accurate count — same query shape as `/c/[slug]` so the
  // two surfaces never disagree. `published` (not `'active'`) per the
  // listings.status check constraint in 0001_init.sql.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { count: activeListings } = await (supabase as any)
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community.id)
    .eq('status', 'published');

  // Phase 34b (V1 redo, 2026-06-17): Scenario B — bottom-left "homes here"
  // chip opens a listings sheet (L2) for the active community. Fetch the
  // full listing rows + hero video/photo here so the sheet has everything
  // it needs without round-tripping. Sorted newest-first.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listingRows } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, price, beds, baths, sqft, created_at',
    )
    .eq('community_id', community.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })) as {
    data: Array<{
      id: string;
      slug: string;
      address: string;
      city: string;
      state: string;
      price: number | null;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      created_at: string;
    }> | null;
  };

  const listingIds = (listingRows ?? []).map((r) => r.id);

  // Hero video + hero photo per listing (parallel; same shape as browse-cards).
  const [{ data: lvRows }, { data: lpRows }] = await Promise.all([
    listingIds.length > 0
      ? // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        ((supabase as any)
          .from('listing_videos')
          .select('listing_id, cf_video_id, sort_order')
          .in('listing_id', listingIds)
          .eq('status', 'ready')
          .order('sort_order', { ascending: true }) as Promise<{
          data: Array<{ listing_id: string; cf_video_id: string }> | null;
        }>)
      : Promise.resolve({ data: [] as Array<{ listing_id: string; cf_video_id: string }> }),
    listingIds.length > 0
      ? // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        ((supabase as any)
          .from('listing_photos')
          .select('listing_id, storage_path, sort_order')
          .in('listing_id', listingIds)
          .eq('status', 'ready')
          .order('sort_order', { ascending: true }) as Promise<{
          data: Array<{ listing_id: string; storage_path: string }> | null;
        }>)
      : Promise.resolve({ data: [] as Array<{ listing_id: string; storage_path: string }> }),
  ]);

  const heroVideoByListing = new Map<string, string>();
  for (const v of lvRows ?? []) {
    if (!heroVideoByListing.has(v.listing_id)) heroVideoByListing.set(v.listing_id, v.cf_video_id);
  }
  const heroPhotoByListing = new Map<string, string>();
  for (const p of lpRows ?? []) {
    if (!heroPhotoByListing.has(p.listing_id)) heroPhotoByListing.set(p.listing_id, p.storage_path);
  }

  const listings: CommunityListingItem[] = (listingRows ?? [])
    .map((l) => {
      const heroCf = heroVideoByListing.get(l.id) ?? null;
      const heroPhotoPath = heroPhotoByListing.get(l.id) ?? null;
      // Per V1 buyer experience: only show listings that have media — a
      // home with no video and no photo can't be browsed visually.
      if (!heroCf && !heroPhotoPath) return null;
      return {
        id: l.id,
        slug: l.slug,
        address: l.address,
        city: l.city,
        state: l.state,
        price: l.price,
        beds: l.beds,
        baths: l.baths,
        sqft: l.sqft,
        heroCfVideoId: heroCf,
        heroPhotoUrl: heroPhotoPath ? photoPublicUrl(heroPhotoPath) : null,
      };
    })
    .filter((x): x is CommunityListingItem => x !== null);

  // Resolve `start` (video id) → array index. Bad/missing falls to 0.
  let initialIndex = 0;
  if (start) {
    const idx = feedVideos.findIndex((v) => v.id === start);
    if (idx >= 0) initialIndex = idx;
  }

  return (
    <CommunityVideoFeed
      community={{
        id: community.id,
        name: community.name,
        slug: community.slug,
        city: community.city,
        state: community.state,
      }}
      videos={feedVideos}
      initialIndex={initialIndex}
      activeListingsCount={activeListings ?? 0}
      listings={listings}
    />
  );
}
