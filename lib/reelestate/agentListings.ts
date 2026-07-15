/**
 * fetchAgentListings — real Supabase read of one agent's active listings for
 * the mobile Agent Profile screen (`/agents/[handle]`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.5
 *
 * A4.2 scope: the Agent Profile tab bar (Reels | Properties) renders two
 * 2-col grids over the same underlying set. We fetch once and let the tab
 * component partition:
 *   - `Reels` tab   → listings with at least one `listing_videos` row
 *                     (either a portrait cf_video_id or a landscape variant).
 *   - `Properties`  → every active listing owned by the agent.
 *
 * Follows the supabase-rsc-perf-playbook skill:
 *   - `createAnonClient()` (cookie-less) so the fetch is safe inside
 *     `unstable_cache` (no dynamic APIs).
 *   - Anon RLS on `listings` permits `status = 'active'` SELECT
 *     (migration 0030_simplify_status). `listing_videos` reads are gated by
 *     the same public policy (0001_init) — safe for buyer-facing surfaces.
 *   - Tag `mobile-agent-listings` + per-agent key so a future agent-owned
 *     mutation can `revalidateTag` this cache separately.
 *
 * No mock/seed fallback: on error or empty result, returns `[]` and the
 * profile tab renders its own empty state.
 */
import { unstable_cache } from 'next/cache';
import { createAnonClient } from '@/lib/supabase/server';

export const MOBILE_AGENT_LISTINGS_TAG = 'mobile-agent-listings';

export interface AgentListingCard {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  has_video: boolean;
}

interface RawRow {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  listing_videos: { id: string }[] | null;
}

const AGENT_LISTINGS_LIMIT = 60;

async function fetchAgentListingsImpl(agentId: string): Promise<AgentListingCard[]> {
  const supabase = createAnonClient();

  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub in this repo
  const { data, error } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, listing_videos ( id )',
    )
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(AGENT_LISTINGS_LIMIT)) as { data: RawRow[] | null; error: unknown };

  if (error || !data) return [];
  return data.map((r) => {
    const { listing_videos, ...rest } = r;
    return {
      ...rest,
      has_video: Array.isArray(listing_videos) && listing_videos.length > 0,
    };
  });
}

export function fetchAgentListings(agentId: string): Promise<AgentListingCard[]> {
  return unstable_cache(
    () => fetchAgentListingsImpl(agentId),
    ['mobile-agent-listings', agentId],
    { revalidate: 60, tags: [MOBILE_AGENT_LISTINGS_TAG] },
  )();
}
