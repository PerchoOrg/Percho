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
}

const REEL_FEED_LIMIT = 5;

export async function fetchReelFeedListings(): Promise<ReelFeedListing[]> {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub in this repo
  const { data, error } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, agent_id, address, city, state, zip, price, beds, baths, sqft, cover_url',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(REEL_FEED_LIMIT)) as { data: ReelFeedListing[] | null; error: unknown };

  if (error || !data) return [];
  return data;
}
