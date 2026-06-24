/**
 * Shared community-grid data loader.
 *
 * Phase 34b (2026-06-17): extracted from `app/(public)/communities/page.tsx`
 * so `/browse?tab=communities` can render the same grid without code
 * duplication. Both pages render identical cards from the identical query.
 *
 * Phase 53 (2026-06-24): parallelized into two waves to cut server time.
 * Wave 1 fetches `communities` + `community_video_membership` in parallel
 * (no inter-dependency). Wave 2 then fetches `community_videos` (needs
 * membership video_ids) + `listings` (needs community ids) in parallel.
 * Net: 5 sequential round-trips → 2 wave-max round-trips.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import { startTimer } from '@/lib/perf/timing';

export type CommunityListCard = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  videoCount: number;
  /** Phase 34b: real count of active listings (`status='active'` && `community_id`). */
  listingCount: number;
  cover: ReturnType<typeof resolveCommunityCoverWithCfIds>;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function fetchCommunityListCards(
  opts: { includeInactive?: boolean } = {},
): Promise<CommunityListCard[]> {
  const t = startTimer('fetchCommunityListCards');
  const supabase = await createClient();
  t.mark('createClient');

  // Wave 1: communities + memberships have no inter-dependency, run in parallel.
  // Phase 46: buyer surfaces only see status='active' communities.
  // Dashboard passes includeInactive=true so the agent can still see
  // and reactivate her own inactive communities.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  let communitiesQ = (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
    .order('name', { ascending: true });
  if (!opts.includeInactive) communitiesQ = communitiesQ.eq('status', 'active');

  const [communitiesRes, membershipsRes] = await Promise.all([
    communitiesQ as Promise<{
      data: Array<{
        id: string;
        name: string;
        slug: string;
        city: string | null;
        state: string;
        description: string | null;
        cover_video_id: string | null;
        cover_storage_path: string | null;
      }> | null;
    }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_video_membership')
      .select('community_id, video_id') as Promise<{
      data: Array<{ community_id: string; video_id: string }> | null;
    }>,
  ]);
  t.mark('wave1');

  const communities = communitiesRes.data ?? [];
  const memberships = membershipsRes.data ?? [];

  const allVideoIds = Array.from(new Set(memberships.map((m) => m.video_id)));
  const communityIds = communities.map((c) => c.id);

  // Wave 2: videos depend on membership video_ids; listings depend on community ids.
  // Both Wave-1 deps are satisfied — run in parallel.
  const [videosRes, listingsRes] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, status')
      .in('id', allVideoIds.length > 0 ? allVideoIds : [NIL_UUID])
      .eq('status', 'ready')
      .eq('visibility', 'public') as Promise<{
      data: Array<{ id: string; cf_video_id: string }> | null;
    }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listings')
      .select('community_id')
      .eq('status', 'active')
      .in('community_id', communityIds.length > 0 ? communityIds : [NIL_UUID]) as Promise<{
      data: Array<{ community_id: string | null }> | null;
    }>,
  ]);
  t.mark('wave2');

  const videoRows = videosRes.data ?? [];
  const listingRows = listingsRes.data ?? [];

  const cfById = new Map<string, string>();
  for (const v of videoRows) cfById.set(v.id, v.cf_video_id);

  const countByCommunity = new Map<string, number>();
  const firstVideoCfByCommunity = new Map<string, string>();
  for (const m of memberships) {
    const cf = cfById.get(m.video_id);
    if (!cf) continue;
    countByCommunity.set(m.community_id, (countByCommunity.get(m.community_id) ?? 0) + 1);
    if (!firstVideoCfByCommunity.has(m.community_id)) {
      firstVideoCfByCommunity.set(m.community_id, cf);
    }
  }

  const listingCountByCommunity = new Map<string, number>();
  for (const r of listingRows) {
    if (!r.community_id) continue;
    listingCountByCommunity.set(
      r.community_id,
      (listingCountByCommunity.get(r.community_id) ?? 0) + 1,
    );
  }

  const result = communities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    city: c.city,
    state: c.state,
    description: c.description,
    videoCount: countByCommunity.get(c.id) ?? 0,
    listingCount: listingCountByCommunity.get(c.id) ?? 0,
    cover: resolveCommunityCoverWithCfIds({
      cover_video_id: c.cover_video_id,
      cover_video_cf_id: c.cover_video_id ? cfById.get(c.cover_video_id) ?? null : null,
      cover_storage_path: c.cover_storage_path,
      fallback_video_cf_id: firstVideoCfByCommunity.get(c.id) ?? null,
    }),
  }));
  t.mark('shape');
  t.end({
    communities: communities.length,
    memberships: memberships.length,
    videoRows: videoRows.length,
    listingRows: listingRows.length,
  });
  return result;
}
