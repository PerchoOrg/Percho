/**
 * fetchReelFeedListings — real Supabase read for the ReelEstate mobile feed.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.1
 *
 * Returns up to 5 active listings, newest first. Uses the anon cookie-based
 * server client (RLS applies). Keeps the shape minimal — the feed card in
 * F1.2 will hydrate agent/media as those tasks land.
 *
 * No mock/seed fallback: if the query fails or returns nothing, we return
 * `[]` and the container renders its empty state (per §5 of the plan).
 */
import { createClient } from '@/lib/supabase/server';

export interface ReelFeedAgent {
  id: string;
  slug: string;
  name: string;
  headshot_url: string | null;
}

export interface ReelFeedListing {
  id: string;
  slug: string;
  agent_id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  agent: ReelFeedAgent | null;
}

const REEL_FEED_LIMIT = 5;

// Raw row shape returned by the join — supabase-js returns `agents` as either
// a single object or an array depending on relationship inference; we normalise
// to a single `agent` on the caller side.
interface RawReelFeedListing {
  id: string;
  slug: string;
  agent_id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  agents: ReelFeedAgent | ReelFeedAgent[] | null;
}

export async function fetchReelFeedListings(): Promise<ReelFeedListing[]> {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub in this repo
  const { data, error } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, address, city, state, zip, price, beds, baths, sqft, cover_url, agents ( id, slug, name, headshot_url )',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(REEL_FEED_LIMIT)) as { data: RawReelFeedListing[] | null; error: unknown };

  if (error || !data) return [];
  return data.map((row) => {
    const agent = Array.isArray(row.agents) ? (row.agents[0] ?? null) : row.agents;
    const { agents: _agents, ...rest } = row;
    return { ...rest, agent };
  });
}
