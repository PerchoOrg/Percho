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
  /** First ready video's cf_video_id — used for the cover thumbnail. Null if community has no ready videos. */
  coverCfVideoId: string | null;
};

export async function fetchSavedCommunitiesAction(input: {
  deviceId: string;
}): Promise<SavedCommunityCard[]> {
  const ids = await listSavedCommunityIds(input);
  if (ids.length === 0) return [];

  const supabase = createServiceClient();

  // Pull the community rows.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: communities } = (await (supabase as any)
    .from('communities')
    .select('id, slug, name, city, state')
    .in('id', ids)) as {
    data: Array<{ id: string; slug: string; name: string; city: string | null; state: string }> | null;
  };
  if (!communities || communities.length === 0) return [];

  // Pull all videos for these communities via the membership view in
  // one shot — pick the first ready video per community as the cover.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('community_id, video_id')
    .in('community_id', ids)) as {
    data: Array<{ community_id: string; video_id: string }> | null;
  };

  const allVideoIds = Array.from(new Set((memberships ?? []).map((m) => m.video_id)));

  let readyVideos: Array<{ id: string; cf_video_id: string }> = [];
  if (allVideoIds.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: vids } = (await (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id')
      .in('id', allVideoIds)
      .eq('status', 'ready')) as { data: Array<{ id: string; cf_video_id: string }> | null };
    readyVideos = vids ?? [];
  }

  const readyById = new Map(readyVideos.map((v) => [v.id, v.cf_video_id] as const));

  // Group ready videos per community.
  const byCommunity = new Map<string, string[]>(); // community_id → cf_video_ids
  for (const m of memberships ?? []) {
    const cf = readyById.get(m.video_id);
    if (!cf) continue;
    const list = byCommunity.get(m.community_id) ?? [];
    list.push(cf);
    byCommunity.set(m.community_id, list);
  }

  // Preserve `ids` order (most-recent-saved-first comes from listSavedCommunityIds).
  const communityById = new Map(communities.map((c) => [c.id, c] as const));
  const result: SavedCommunityCard[] = [];
  for (const id of ids) {
    const c = communityById.get(id);
    if (!c) continue;
    const cfList = byCommunity.get(id) ?? [];
    result.push({
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      state: c.state,
      videoCount: cfList.length,
      coverCfVideoId: cfList[0] ?? null,
    });
  }
  return result;
}
