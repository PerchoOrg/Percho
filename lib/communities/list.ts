/**
 * Shared community-grid data loader.
 *
 * Phase 34b (2026-06-17): extracted from `app/(public)/communities/page.tsx`
 * so `/browse?tab=communities` can render the same grid without code
 * duplication. Both pages render identical cards from the identical query.
 *
 * Phase 53 Phase A (2026-06-24): parallelized into two waves.
 * Wave 1 fetches `communities` + `community_video_membership` in parallel
 * (no inter-dependency). Wave 2 then fetches `community_videos` (needs
 * membership video_ids) + `listings` (needs community ids) in parallel.
 *
 * Phase 53 Phase C (2026-06-24): wrapped in `unstable_cache` (60s TTL,
 * tagged 'community-cards'). Community data is globally readable so a
 * shared cache across users is safe. Mutation server actions call
 * `revalidateTag('community-cards')` to invalidate.
 *
 * Cache uses the cookie-less `createAnonClient()` because `unstable_cache`
 * forbids dynamic APIs (cookies/headers) inside the cached fn. RLS still
 * applies — community reads are global, so this returns the same rows as
 * the cookie-bound client would for these particular tables.
 *
 * Phase 72.2 (2026-07-05): visibility rule tightened. Previously any
 * caller could pass `includeInactive: true` and get every inactive
 * community system-wide (agent dashboard did this). That leaked one
 * agent's drafts to other agents. New shape:
 *   fetchCommunityListCards({ viewerAgentId }) →
 *     union of (all active) ∪ (viewer's own inactive), de-duped by id.
 * Active set is still shared-cached; the per-viewer inactive fetch is
 * uncached because it's cheap and viewer-specific.
 */

import { unstable_cache } from 'next/cache';
import { resolveCommunityCoverWithCfIds } from '@/lib/community/cover';
import { createAnonClient } from '@/lib/supabase/server';
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

export const COMMUNITY_CARDS_TAG = 'community-cards';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
  cover_video_id: string | null;
  cover_storage_path: string | null;
};

/**
 * Given a set of community rows, hydrate them with videoCount / listingCount
 * / cover. Split out so the shared "all active" pass and the per-viewer
 * "your inactive" pass can share the same enrichment code.
 */
async function hydrateCommunityCards(
  communities: CommunityRow[],
): Promise<CommunityListCard[]> {
  if (communities.length === 0) return [];
  const supabase = createAnonClient();
  const communityIds = communities.map((c) => c.id);

  // Wave 1: memberships (needed to compute videoCount + fallback cover cf id).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: memberships } = (await (supabase as any)
    .from('community_video_membership')
    .select('community_id, video_id')
    .in('community_id', communityIds)) as {
    data: Array<{ community_id: string; video_id: string }> | null;
  };
  const memberRows = memberships ?? [];
  const allVideoIds = Array.from(new Set(memberRows.map((m) => m.video_id)));

  // Wave 2: videos (ready+public only) + listings (active), in parallel.
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
      .in('community_id', communityIds) as Promise<{
      data: Array<{ community_id: string | null }> | null;
    }>,
  ]);

  const videoRows = videosRes.data ?? [];
  const listingRows = listingsRes.data ?? [];

  const cfById = new Map<string, string>();
  for (const v of videoRows) cfById.set(v.id, v.cf_video_id);

  const countByCommunity = new Map<string, number>();
  const firstVideoCfByCommunity = new Map<string, string>();
  for (const m of memberRows) {
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

  return communities.map((c) => ({
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
}

async function fetchActiveCommunitiesImpl(): Promise<CommunityListCard[]> {
  const t = startTimer('fetchActiveCommunities');
  const supabase = createAnonClient();
  t.mark('createClient');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
    // Phase 72 (2026-07-05): never surface the upload-flow `Untitled community`
    // stub — owner has never touched it (name still = stub), so it's just noise.
    .neq('name', 'Untitled community')
    .eq('status', 'active')
    .order('name', { ascending: true })) as { data: CommunityRow[] | null };
  t.mark('query');

  const rows = data ?? [];
  const cards = await hydrateCommunityCards(rows);
  t.end({ communities: rows.length, cached: false });
  return cards;
}

const cachedActive = unstable_cache(
  () => fetchActiveCommunitiesImpl(),
  ['community-cards', 'active-only'],
  { revalidate: 60, tags: [COMMUNITY_CARDS_TAG] },
);

/**
 * Uncached, viewer-scoped: this agent's own inactive/draft communities.
 * Not cached because it's per-viewer and cheap (bounded by rows the agent
 * created). Still filters out the `Untitled community` upload stub — that
 * one is noise even to its owner until they touch it (at which point the
 * name changes and it starts showing up here).
 */
async function fetchOwnInactiveCommunities(agentId: string): Promise<CommunityListCard[]> {
  const t = startTimer('fetchOwnInactiveCommunities');
  const supabase = createAnonClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
    .neq('status', 'active')
    .neq('name', 'Untitled community')
    .eq('created_by', agentId)
    .order('name', { ascending: true })) as { data: CommunityRow[] | null };

  const rows = data ?? [];
  const cards = await hydrateCommunityCards(rows);
  t.end({ communities: rows.length, agentId });
  return cards;
}

/**
 * Phase 83.2 (2026-07-15): viewer-scoped "my neighborhoods" for the
 * agent dashboard.
 *
 * The buyer/public `/communities` grid shows every active community
 * (including the 731 Nextdoor seeds — public reference data).
 * The agent dashboard needs a narrower view: neighborhoods the agent
 * actually cares about. Those are:
 *   (a) communities the agent created (any status)
 *   (b) communities where the agent has an active listing
 *       (via `listings.community_id`, auto-associated on address save)
 *
 * Union, de-duped by id, sorted by name.
 *
 * Uncached because it's per-viewer and cheap: an agent has O(10) rows,
 * not O(1000).
 */
async function fetchAgentScopedCommunities(agentId: string): Promise<CommunityListCard[]> {
  const t = startTimer('fetchAgentScopedCommunities');
  const supabase = createAnonClient();

  // Query 1: communities the agent created.
  // Query 2: distinct community_ids from the agent's active listings.
  const [createdRes, listingRes] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('communities')
      .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
      .eq('created_by', agentId)
      .neq('name', 'Untitled community') as Promise<{ data: CommunityRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listings')
      .select('community_id')
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .not('community_id', 'is', null) as Promise<{
      data: Array<{ community_id: string | null }> | null;
    }>,
  ]);

  const createdRows = createdRes.data ?? [];
  const listingCommunityIds = Array.from(
    new Set((listingRes.data ?? []).map((r) => r.community_id).filter((x): x is string => !!x)),
  );

  // Fetch any community-by-listing rows that aren't already in the
  // created-by set. Skip DB round-trip when there's nothing to load.
  const needIds = listingCommunityIds.filter((id) => !createdRows.some((r) => r.id === id));
  let linkedRows: CommunityRow[] = [];
  if (needIds.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data } = (await (supabase as any)
      .from('communities')
      .select('id, name, slug, city, state, description, cover_video_id, cover_storage_path')
      .in('id', needIds)) as { data: CommunityRow[] | null };
    linkedRows = data ?? [];
  }

  const byId = new Map<string, CommunityRow>();
  for (const r of createdRows) byId.set(r.id, r);
  for (const r of linkedRows) byId.set(r.id, r);

  const merged = Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );

  const cards = await hydrateCommunityCards(merged);
  t.end({
    communities: cards.length,
    created: createdRows.length,
    viaListing: linkedRows.length,
    agentId,
  });
  return cards;
}

/**
 * Public entry point — **buyer / public surface**.
 *
 * Returns all active communities (the 731 Nextdoor seeds are visible
 * here). If a `viewerAgentId` is supplied we also union in that agent's
 * own inactive drafts so their in-progress work shows up alongside the
 * shared pool.
 *
 * Sorted by name.
 */
export async function fetchCommunityListCards(
  opts: { viewerAgentId?: string | null } = {},
): Promise<CommunityListCard[]> {
  const active = await cachedActive();
  const viewerAgentId = opts.viewerAgentId ?? null;
  if (!viewerAgentId) return active;

  const own = await fetchOwnInactiveCommunities(viewerAgentId);
  if (own.length === 0) return active;

  const byId = new Map<string, CommunityListCard>();
  for (const c of active) byId.set(c.id, c);
  for (const c of own) byId.set(c.id, c);
  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Agent-scoped entry point — **dashboard "my neighborhoods"**.
 *
 * Returns only communities the agent is involved in:
 *  - created by them (any status), or
 *  - has an active listing pointing at (via `listings.community_id`).
 *
 * The 731 shared Nextdoor seeds do NOT appear here unless the agent
 * has a listing in one.
 */
export async function fetchMyCommunityCards(agentId: string): Promise<CommunityListCard[]> {
  return fetchAgentScopedCommunities(agentId);
}
