/**
 * Public agent profile page — `/a/[agentSlug]`.
 *
 * Phase 8 stretch goal. The single most-requested Path-3 feature: Vivian has
 * 12 listings; she does NOT want to send 12 different URLs in WhatsApp /
 * email / Facebook DMs. She wants ONE link — vicinities.cc/a/vivian-zhang —
 * that surfaces every published listing she has, presented in her brand.
 *
 * What's on the page:
 *   - Agent hero: headshot + name + brokerage + license + bio + contact CTAs
 *     (email + phone tel:/mailto:).
 *   - Listings grid: every published listing for this agent, oldest first
 *     (we want her newest at the bottom so you scroll past her best work) —
 *     wait, actually newest first. Realtors live and die by "just listed".
 *     Sorted by `created_at` desc.
 *   - Empty state: friendly "no listings yet" if she has no published rows
 *     (still want the page to render — she can share the URL eagerly).
 *
 * RLS notes:
 *   - `agents` has a `public reads agent profile` policy (everyone can SELECT).
 *   - `listings` has a published-only public read policy.
 *   - `listing_videos` ditto for ready rows (we use cover_url + first video
 *     thumbnail as fallback).
 *
 * SSR with ISR (revalidate=300, 5 min): listings rarely change minute-to-
 * minute. Agent edits a listing, worst case CDN serves a 5-min-stale card.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 300;

type PageParams = { agentSlug: string };

type AgentRow = {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone: string | null;
  headshot_url: string | null;
  brokerage: string | null;
  license_no: string | null;
  bio: string | null;
};

type ListingCard = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  created_at: string;
  hero_video_id: string | null;
};

async function fetchAgent(agentSlug: string): Promise<AgentRow | null> {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name, email, phone, headshot_url, brokerage, license_no, bio')
    .eq('slug', agentSlug)
    .maybeSingle()) as { data: AgentRow | null };
  return data;
}

async function fetchListings(agentId: string): Promise<ListingCard[]> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select('id, slug, address, city, state, price, beds, baths, sqft, cover_url, created_at')
    .eq('agent_id', agentId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })) as {
    data: Omit<ListingCard, 'hero_video_id'>[] | null;
  };

  const listings = rawListings ?? [];
  if (listings.length === 0) return [];

  // For each listing, find a hero video id to use as fallback when cover_url
  // is null. One round-trip via in() then group by listing_id in JS.
  const ids = listings.map((l) => l.id);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawVideos } = (await (supabase as any)
    .from('listing_videos')
    .select('listing_id, cf_video_id, sort_order')
    .in('listing_id', ids)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })) as {
    data: { listing_id: string; cf_video_id: string; sort_order: number | null }[] | null;
  };
  const videos = rawVideos ?? [];
  const firstVideoByListing = new Map<string, string>();
  for (const v of videos) {
    if (!firstVideoByListing.has(v.listing_id)) {
      firstVideoByListing.set(v.listing_id, v.cf_video_id);
    }
  }

  return listings.map((l) => ({
    ...l,
    hero_video_id: firstVideoByListing.get(l.id) ?? null,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { agentSlug } = await params;
  const agent = await fetchAgent(agentSlug);
  if (!agent) return { title: 'Agent not found | Vicinity' };
  const brokerage = agent.brokerage ?? 'Vicinity';
  return {
    title: `${agent.name} — ${brokerage} | Vicinity`,
    description: agent.bio ?? `See ${agent.name}'s listings on Vicinity.`,
    openGraph: {
      title: `${agent.name} — ${brokerage}`,
      description: agent.bio ?? `${agent.name}'s listings on Vicinity.`,
      images: agent.headshot_url ? [{ url: agent.headshot_url }] : undefined,
    },
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { agentSlug } = await params;
  const agent = await fetchAgent(agentSlug);
  if (!agent) notFound();

  const listings = await fetchListings(agent.id);

  return (
    <div className="min-h-screen bg-ink text-cream">
      {/* Hero */}
      <section className="border-bronze/20 border-b">
        <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            {/* Headshot */}
            <div className="shrink-0">
              {agent.headshot_url ? (
                <img
                  src={agent.headshot_url}
                  alt={agent.name}
                  className="h-32 w-32 rounded-full border-2 border-gold/40 object-cover md:h-40 md:w-40"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-gold/40 bg-ink2 font-serif text-4xl text-gold md:h-40 md:w-40">
                  {agent.name.slice(0, 1)}
                </div>
              )}
            </div>

            {/* Identity + CTAs */}
            <div className="flex-1">
              <h1 className="font-serif text-3xl md:text-4xl">{agent.name}</h1>
              {agent.brokerage && <p className="mt-1 text-cream/70 text-sm">{agent.brokerage}</p>}
              {agent.license_no && (
                <p className="mt-1 text-cream/40 text-xs">License #{agent.license_no}</p>
              )}
              {agent.bio && (
                <p className="mt-4 max-w-2xl whitespace-pre-line text-cream/80 text-sm leading-relaxed">
                  {agent.bio}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href={`mailto:${agent.email}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 font-medium text-ink text-sm transition hover:opacity-90"
                >
                  Email {agent.name.split(' ')[0]}
                </a>
                {agent.phone && (
                  <a
                    href={`tel:${agent.phone}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-bronze/50 px-4 py-2 text-cream text-sm hover:bg-bronze/20"
                  >
                    {formatPhone(agent.phone)}
                  </a>
                )}
                <ShareButton />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl">Listings</h2>
          <span className="text-cream/40 text-xs">
            {listings.length} {listings.length === 1 ? 'home' : 'homes'}
          </span>
        </div>
        {listings.length === 0 ? (
          <div className="rounded-xl border border-bronze/30 bg-ink2/60 p-8 text-center">
            <p className="text-cream/70">No live listings right now.</p>
            <p className="mt-1 text-cream/40 text-sm">
              Check back soon or reach out directly above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCardView key={l.id} agentSlug={agent.slug} listing={l} />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-bronze/20 border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-cream/40 text-xs">
          <p>
            <Link href="/" className="hover:text-gold hover:underline">
              Vicinity
            </Link>{' '}
            · Equal Housing Opportunity. All listings shown are submitted by the agent and are
            subject to verification.
          </p>
        </div>
      </footer>
    </div>
  );
}

function ListingCardView({
  agentSlug,
  listing,
}: {
  agentSlug: string;
  listing: ListingCard;
}) {
  const cover =
    listing.cover_url ?? (listing.hero_video_id ? thumbnailUrl(listing.hero_video_id) : null);
  return (
    <Link
      href={`/v/${agentSlug}/${listing.slug}`}
      className="group overflow-hidden rounded-xl border border-bronze/30 bg-ink2/60 transition hover:border-gold/50"
    >
      <div className="aspect-[4/5] w-full overflow-hidden bg-ink">
        {cover ? (
          <img
            src={cover}
            alt={listing.address}
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cream/30 text-xs">
            No cover
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-serif text-cream text-lg leading-tight">
          {listing.price != null ? `$${formatPrice(listing.price)}` : 'Price upon request'}
        </div>
        <div className="mt-0.5 truncate text-cream/80 text-sm">{listing.address}</div>
        <div className="text-cream/50 text-xs">
          {listing.city}, {listing.state}
        </div>
        <div className="mt-2 flex items-center gap-2 text-cream/60 text-xs">
          {listing.beds != null && <span>{listing.beds} bd</span>}
          {listing.baths != null && <span>· {listing.baths} ba</span>}
          {listing.sqft != null && <span>· {listing.sqft.toLocaleString()} sqft</span>}
        </div>
      </div>
    </Link>
  );
}

function ShareButton() {
  // Server component — render a noscript-friendly anchor that copies the page URL
  // when JS is available (handled by inline script below). Keeping this dead-simple
  // because the agent-profile page is the *target* of shares, not the source.
  // For Phase 8 we ship without the JS handler — agents copy from the URL bar.
  // Adding a real share button would require 'use client' for the click handler;
  // skipping for now per the surgical-changes principle.
  return null;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(2).replace(/\.0+$/, '')}M`;
  if (price >= 1_000) return `${Math.round(price / 1_000)}k`;
  return price.toLocaleString();
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
