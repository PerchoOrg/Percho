/**
 * /c/[slug] — buyer-facing community page.
 *
 * Phase 27: shipped IA + thumbnail grid + active-listings count.
 * Phase 45.10–45.11: hero shrunk, sub-tab toggle introduced.
 * Phase 45.28 (2026-06-21, owner immersion pass): hero + grid moved into
 * <CommunityBody> client island. Hero shrunk further (5/2 mobile, 5/1
 * desktop), pill toggle row removed (videos default), and a "Live here →"
 * CTA pill in the hero's bottom-right now switches the body to the
 * active-listings grid.
 */

import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import { fetchBrowseCardsByCommunitySlug } from '@/lib/feed/browse-cards';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CommunityBody } from './_components/CommunityBody';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  created_by: string | null;
  cover_video_id: string | null;
  cover_storage_path: string | null;
  boundary: unknown;
}

interface VideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select(
      'id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path, status, residents_count, avg_income, avg_age, homeowners_pct, attributes, interests, nearby, boundary',
    )
    .eq('slug', slug)
    .maybeSingle()) as { data: (CommunityRow & { status: string }) | null };

  // Phase 46: inactive communities are 404 to buyers (the creating agent
  // sees them in /dashboard/communities so they can reactivate).
  if (!community || community.status !== 'active') notFound();

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
      .select('id, cf_video_id, title, category')
      .in('id', videoIds)
      .eq('status', 'ready')
      .eq('visibility', 'public')) as { data: VideoRow[] | null };
    videos = rows ?? [];
  }

  // Active listings inside this community — reuse the browse-card builder
  // so cards match the global feed shape exactly (BrowseCard type).
  const listings = await fetchBrowseCardsByCommunitySlug(community.slug);

  // Phase 87.2: resolve `nearby` — each entry carries a `slug` from Nextdoor
  // (i.e. nextdoor_slug), plus name/city/state/lat/lng. We look up which of
  // those neighborhoods we've actually seeded (status=active) so we can render
  // real /c/[slug] links; unresolved names still show as static labels.
  type NearbyRaw = { name: string; slug?: string; city?: string; state?: string };
  const rawNearby = Array.isArray((community as any).nearby)
    ? ((community as any).nearby as NearbyRaw[]).slice(0, 6)
    : [];
  const nearbyNdSlugs = rawNearby.map((n) => n.slug).filter((s): s is string => !!s);
  let nearbyLookup = new Map<string, { slug: string; name: string; city: string | null; state: string }>();
  if (nearbyNdSlugs.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: nrows } = (await (supabase as any)
      .from('communities')
      .select('slug, name, city, state, nextdoor_slug')
      .in('nextdoor_slug', nearbyNdSlugs)
      .eq('status', 'active')) as {
      data: Array<{ slug: string; name: string; city: string | null; state: string; nextdoor_slug: string }> | null;
    };
    nearbyLookup = new Map((nrows ?? []).map((r) => [r.nextdoor_slug, r]));
  }
  const nearbyCards = rawNearby.map((n) => {
    const hit = n.slug ? nearbyLookup.get(n.slug) : undefined;
    return {
      name: hit?.name ?? n.name,
      city: hit?.city ?? n.city ?? null,
      state: hit?.state ?? n.state ?? community.state,
      href: hit ? `/c/${hit.slug}` : null,
    };
  });

  // Hero cover.
  const firstReadyVideo = videos[0] ?? null;
  const coverVideoCfId = community.cover_video_id
    ? (videos.find((v) => v.id === community.cover_video_id)?.cf_video_id ?? null)
    : null;
  const heroCover = resolveCommunityCoverWithCfIds({
    cover_video_id: community.cover_video_id,
    cover_video_cf_id: coverVideoCfId,
    cover_storage_path: community.cover_storage_path,
    fallback_video_cf_id: firstReadyVideo?.cf_video_id ?? null,
    name: community.name,
    boundary: (community.boundary as import('@/lib/community/logo-cover').BoundaryGeoJSON | null) ?? null,
  });

  const heroCoverUrl = heroCover ? heroCover.url : null;

  return (
    <CommunityBody
      community={{
        id: community.id,
        name: community.name,
        slug: community.slug,
        city: community.city,
        state: community.state,
        description: community.description,
        residents_count: (community as any).residents_count ?? null,
        avg_income: (community as any).avg_income ?? null,
        avg_age: (community as any).avg_age ?? null,
        homeowners_pct: (community as any).homeowners_pct ?? null,
        attributes: (community as any).attributes ?? null,
        interests: (community as any).interests ?? null,
      }}
      heroCoverUrl={heroCoverUrl}
      boundary={(community.boundary as import('@/lib/geo/point-in-polygon').GeoJsonPolygonLike | null) ?? null}
      nearby={nearbyCards}
      videos={videos}
      listings={listings}
    />
  );
}
