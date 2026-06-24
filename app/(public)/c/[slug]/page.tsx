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
      'id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path, status',
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
      }}
      heroCoverUrl={heroCoverUrl}
      videos={videos}
      listings={listings}
    />
  );
}
