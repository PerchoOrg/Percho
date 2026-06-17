'use server';

/**
 * Phase 21 (2026-06-13): server-action wrapper that fetches saved
 * listings as `BrowseCard[]` for the /saved page. Sequences:
 *   1. listSavedListingIds(device) → ordered listing_ids
 *   2. fetchBrowseCardsByIds(ids)   → BrowseCard rows
 *
 * Splitting the join across two queries instead of expanding the SQL
 * join in `app/_actions/saved-listings.ts` reuses `assembleCards`'s
 * logic (cover photo / video pick, schools, POIs, communities, agent),
 * keeping a single source of truth for what a card looks like.
 *
 * Phase 27.7 (2026-06-17): saved communities — separate flow from
 * listings. Each saved community renders as a card with a cover
 * thumbnail (first ready video's poster) + video count + city/state.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { listSavedCommunityIds } from '@/app/_actions/saved-communities';
import { listSavedListingIds } from '@/app/_actions/saved-listings';
import { fetchBrowseCardsByIds } from '@/lib/feed/browse-cards';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import { createServiceClient } from '@/lib/supabase/server';

export async function fetchSavedCardsAction(input: {
  deviceId: string;
}): Promise<BrowseCard[]> {
  const ids = await listSavedListingIds(input);
  if (ids.length === 0) return [];
  return fetchBrowseCardsByIds(ids);
}

export type SavedCommunityCard = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  videoCount: number;
  /** Resolved cover URL (agent pick > uploaded image > first ready video). Null if nothing usable. */
  coverUrl: string | null;
};

export async function fetchSavedCommunitiesAction(input: {
  deviceId: string;
}): Promise<SavedCommunityCard[]> {
  const ids = await listSavedCommunityIds(input);
  if (ids.length === 0) return [];

  const supabase = createServiceClient();

  // Pull the community rows including cover columns.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: communities } = (await (supabase as any)
    .from('communities')
    .select('id, slug, name, city, state, cover_video_id, cover_storage_path')
    .in('id', ids)) as {
    data: Array<{
      id: string;
      slug: string;
      name: string;
      city: string | null;
      state: string;
      cover_video_id: string | null;
      cover_storage_path: string | null;
    }> | null;
  };
  if (!communities || communities.length === 0) return [];

  // Pull all videos for these communities via the membership view in
  // one shot — pick the first ready video per community as the fallback
  // cover. Also resolve cf_video_id for any explicit cover_video_id pick.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('community_id, video_id')
    .in('community_id', ids)) as {
    data: Array<{ community_id: string; video_id: string }> | null;
  };

  const allVideoIds = new Set<string>((memberships ?? []).map((m) => m.video_id));
  for (const c of communities) {
    if (c.cover_video_id) allVideoIds.add(c.cover_video_id);
  }

  let readyVideos: Array<{ id: string; cf_video_id: string }> = [];
  if (allVideoIds.size > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: vids } = (await (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id')
      .in('id', Array.from(allVideoIds))
      .eq('status', 'ready')
      .eq('visibility', 'public')) as { data: Array<{ id: string; cf_video_id: string }> | null };
    readyVideos = vids ?? [];
  }

  const readyById = new Map(readyVideos.map((v) => [v.id, v.cf_video_id] as const));

  // Group ready videos per community for the fallback + count.
  const byCommunity = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const cf = readyById.get(m.video_id);
    if (!cf) continue;
    const list = byCommunity.get(m.community_id) ?? [];
    list.push(cf);
    byCommunity.set(m.community_id, list);
  }

  const communityById = new Map(communities.map((c) => [c.id, c] as const));
  const result: SavedCommunityCard[] = [];
  for (const id of ids) {
    const c = communityById.get(id);
    if (!c) continue;
    const cfList = byCommunity.get(id) ?? [];
    const cover = resolveCommunityCoverWithCfIds({
      cover_video_id: c.cover_video_id,
      cover_video_cf_id: c.cover_video_id ? readyById.get(c.cover_video_id) ?? null : null,
      cover_storage_path: c.cover_storage_path,
      fallback_video_cf_id: cfList[0] ?? null,
    });
    result.push({
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      state: c.state,
      videoCount: cfList.length,
      coverUrl: cover?.url ?? null,
    });
  }
  return result;
}
