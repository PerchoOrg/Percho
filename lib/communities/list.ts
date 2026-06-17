/**
 * Shared community-grid data loader.
 *
 * Phase 34b (2026-06-17): extracted from `app/(public)/communities/page.tsx`
 * so `/browse?tab=communities` can render the same grid without code
 * duplication. Both pages render identical cards from the identical query.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';

export type CommunityListCard = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  videoCount: number;
  cover: ReturnType<typeof resolveCommunityCoverWithCfIds>;
};

export async function fetchCommunityListCards(): Promise<CommunityListCard[]> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rows } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
    .order('name', { ascending: true })) as {
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
  };

  const communities = rows ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('community_id, video_id')) as {
    data: Array<{ community_id: string; video_id: string }> | null;
  };

  const allVideoIds = Array.from(new Set((memberships ?? []).map((m) => m.video_id)));
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRows } = (await (supabase as any)
    .from('community_videos')
    .select('id, cf_video_id, status')
    .in('id', allVideoIds.length > 0 ? allVideoIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'ready')) as {
    data: Array<{ id: string; cf_video_id: string }> | null;
  };
  const cfById = new Map<string, string>();
  for (const v of videoRows ?? []) cfById.set(v.id, v.cf_video_id);

  const countByCommunity = new Map<string, number>();
  const firstVideoCfByCommunity = new Map<string, string>();
  for (const m of memberships ?? []) {
    const cf = cfById.get(m.video_id);
    if (!cf) continue;
    countByCommunity.set(m.community_id, (countByCommunity.get(m.community_id) ?? 0) + 1);
    if (!firstVideoCfByCommunity.has(m.community_id)) {
      firstVideoCfByCommunity.set(m.community_id, cf);
    }
  }

  return communities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    city: c.city,
    state: c.state,
    description: c.description,
    videoCount: countByCommunity.get(c.id) ?? 0,
    cover: resolveCommunityCoverWithCfIds({
      cover_video_id: c.cover_video_id,
      cover_video_cf_id: c.cover_video_id ? cfById.get(c.cover_video_id) ?? null : null,
      cover_storage_path: c.cover_storage_path,
      fallback_video_cf_id: firstVideoCfByCommunity.get(c.id) ?? null,
    }),
  }));
}
