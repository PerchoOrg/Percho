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
 * Phase 114 (2026-07-17): `boundary` is intentionally NOT selected in the
 * top-level list query. Boundary is a per-community GeoJSON polygon (often
 * multi-KB — the Nextdoor seeds are dense multipolygons). PostgREST was
 * hitting `statement_timeout` (Postgres 57014) trying to stream ~8k rows
 * with `boundary` inline, so `/communities` returned nothing at all
 * (see phase111 → phase114 sequence). We now fetch boundary lazily in
 * `hydrateCommunityCards`, only for the rows whose cover falls all the way
 * through to the logo-SVG fallback (no cover_video_id AND no
 * cover_storage_path).
 */

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

  // Phase 111 (2026-07-17): batch the .in() calls. At scale (8k+ active
  // communities) a single `.in('community_id', <8000 ids>)` produces a
  // ~300KB URL and PostgREST rejects with 400. We chunk to 500 ids per
  // request and merge in-memory.
  const CHUNK = 500;
  async function chunkedIn<T>(
    fn: (batch: string[]) => Promise<{ data: T[] | null }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < communityIds.length; i += CHUNK) {
      const batch = communityIds.slice(i, i + CHUNK);
      const { data } = await fn(batch);
      if (data) out.push(...data);
    }
    return out;
  }

  // Wave 1: memberships (needed to compute videoCount + fallback cover cf id).
  const memberRows = await chunkedIn<{ community_id: string; video_id: string }>(
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (batch) =>
      (supabase as any)
        .from('community_video_membership')
        .select('community_id, video_id')
        .in('community_id', batch),
  );
  const allVideoIds = Array.from(new Set(memberRows.map((m) => m.video_id)));

  // Wave 2: videos (ready+public only) + listings (active).
  // Videos batched by video_id, listings batched by community_id.
  async function chunkedInField<T>(
    ids: string[],
    fn: (batch: string[]) => Promise<{ data: T[] | null }>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const { data } = await fn(batch);
      if (data) out.push(...data);
    }
    return out;
  }

  const [videoRows, listingRows] = await Promise.all([
    allVideoIds.length === 0
      ? Promise.resolve([] as Array<{ id: string; cf_video_id: string }>)
      : chunkedInField<{ id: string; cf_video_id: string }>(allVideoIds, (batch) =>
          // biome-ignore lint/suspicious/noExplicitAny: stub generated types
          (supabase as any)
            .from('community_videos')
            .select('id, cf_video_id, status')
            .in('id', batch)
            .eq('status', 'ready')
            .eq('visibility', 'public')
            // Phase 92: skip history renders.
            .eq('is_primary', true),
        ),
    chunkedIn<{ community_id: string | null }>(
      // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      (batch) =>
        (supabase as any)
          .from('listings')
          .select('community_id')
          .eq('status', 'active')
          .in('community_id', batch),
    ),
  ]);

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

  // Phase 114 (2026-07-17): lazily fetch `boundary` only for rows that
  // fall all the way to the logo-svg fallback (no cover_video_id AND no
  // cover_storage_path). Selecting boundary inline for all ~8k active
  // communities was timing out the top-level query at PostgREST
  // (statement_timeout / Postgres 57014).
  const needsBoundaryIds = communities
    .filter((c) => !c.cover_video_id && !c.cover_storage_path)
    .map((c) => c.id);
  const boundaryByCommunity = new Map<string, unknown>();
  if (needsBoundaryIds.length > 0) {
    const boundaryRows = await chunkedInField<{ id: string; boundary: unknown }>(
      needsBoundaryIds,
      // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      (batch) =>
        (supabase as any)
          .from('communities')
          .select('id, boundary')
          .in('id', batch),
    );
    for (const r of boundaryRows) boundaryByCommunity.set(r.id, r.boundary);
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
      name: c.name,
      boundary: (boundaryByCommunity.get(c.id) as import('@/lib/community/logo-cover').BoundaryGeoJSON | null) ?? null,
    }),
  }));
}

/**
 * Phase 114 (2026-07-17): rank order for the public buyer grid — surface
 * meaningful neighborhoods first. The 731 Nextdoor seeds with 0 listings /
 * 0 videos otherwise dominate the top of an alphabetical list (starts with
 * " River Summit", "12 Mile", "1250 West"…) so buyers see nothing but
 * empty tiles above the fold.
 *
 * Tiers, high → low:
 *   1. has ≥1 active listing (there are homes to buy here)
 *   2. has ≥1 community video (some content, even without a listing)
 *   3. nothing yet (Nextdoor seed reference data)
 * Within each tier, alphabetical by name.
 */
function rankByRelevance(a: CommunityListCard, b: CommunityListCard): number {
  const tierA = a.listingCount > 0 ? 0 : a.videoCount > 0 ? 1 : 2;
  const tierB = b.listingCount > 0 ? 0 : b.videoCount > 0 ? 1 : 2;
  if (tierA !== tierB) return tierA - tierB;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
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
  cards.sort(rankByRelevance);
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
  return Array.from(byId.values()).sort(rankByRelevance);
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
