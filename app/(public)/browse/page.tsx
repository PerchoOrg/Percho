/**
 * /browse — discovery feed across all agents (TikTok mode, not grid).
 *
 * Hotfix 2026-06-10 (v2): user wanted demo-parity — Browse should drop into
 * the same vertical-snap video feed as /v/[agent]/[listing], but with one
 * card per listing (their hero video) and a right rail that lets the user
 * jump into the full listing or contact the agent.
 *
 * Server Component. Fetches up to 30 published listings (newest first), one
 * hero video per listing (lowest sort_order, status='ready'). Filters out
 * listings with no playable video — they'd render a black card.
 */

import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { type BrowseCard, BrowseFeed } from './_components/BrowseFeed';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Browse listings | Vicinity',
  description: 'Discover homes for sale on Vicinity — short videos, real agents, no spam.',
};

const FEED_LIMIT = 30;

type ListingRow = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  created_at: string;
  agent_id: string;
};

type AgentRow = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type VideoRow = {
  listing_id: string;
  cf_video_id: string;
  title: string | null;
  kind: string;
  sort_order: number;
};

async function fetchCards(): Promise<BrowseCard[]> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select('id, slug, address, city, state, price, beds, baths, sqft, created_at, agent_id')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT)) as { data: ListingRow[] | null };

  const listings = rawListings ?? [];
  if (listings.length === 0) return [];

  const listingIds = listings.map((l) => l.id);
  const agentIds = Array.from(new Set(listings.map((l) => l.agent_id)));

  const [videosResp, agentsResp] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listing_videos')
      .select('listing_id, cf_video_id, title, kind, sort_order')
      .in('listing_id', listingIds)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true }),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('agents')
      .select('id, slug, name, email, phone')
      .in('id', agentIds),
  ]);

  const videos = (videosResp.data ?? []) as VideoRow[];
  const agents = (agentsResp.data ?? []) as AgentRow[];

  const heroByListing = new Map<string, VideoRow>();
  for (const v of videos) {
    if (!heroByListing.has(v.listing_id)) heroByListing.set(v.listing_id, v);
  }
  const agentsById = new Map(agents.map((a) => [a.id, a] as const));

  const cards: BrowseCard[] = [];
  for (const l of listings) {
    const hero = heroByListing.get(l.id);
    const agent = agentsById.get(l.agent_id);
    if (!hero || !agent) continue;
    cards.push({
      id: hero.cf_video_id,
      cfVideoId: hero.cf_video_id,
      kind: hero.kind,
      title: hero.title,
      listing: {
        id: l.id,
        slug: l.slug,
        address: l.address,
        city: l.city,
        state: l.state,
        price: l.price,
        beds: l.beds,
        baths: l.baths,
        sqft: l.sqft,
      },
      agent: {
        slug: agent.slug,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
      },
    });
  }
  return cards;
}

export default async function BrowsePage() {
  const cards = await fetchCards();

  if (cards.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-cream">
        <div className="text-center">
          <h1 className="font-serif text-2xl">No listings live yet</h1>
          <p className="mt-2 text-cream/60 text-sm">
            Check back soon — Vicinity is just getting started.
          </p>
        </div>
      </div>
    );
  }

  return <BrowseFeed cards={cards} />;
}
