/**
 * Public agent profile page — `/a/[agentSlug]`.
 *
 * Phase 38 (2026-06-18): redesigned in Aman direction (warm cream, no gold).
 * The profile is now the centerpiece "gallery" experience — Vivian's listings
 * presented like a Pixieset portfolio: full-bleed cover, large serif address,
 * tracked-caps eyebrow, hairline dividers, generous whitespace.
 *
 * RLS / data load unchanged — see DESIGN.md for the token reference.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { DEMO_MEDIA_ENABLED, demoCoverFor, demoHeadshotFor } from '@/lib/demo-media';
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
  const firstName = agent.name.split(' ')[0];

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Hero — Aman idiom: eyebrow caps + large serif name + hairline. */}
      <section>
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-10 md:pt-24 md:pb-14">
          <div className="eyebrow mb-6">Vicinity · Listing Specialist</div>

          <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-6 md:items-end md:gap-8">
              {(() => {
                const headshot = demoHeadshotFor(agent.headshot_url);
                return headshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headshot}
                    alt={agent.name}
                    className="h-20 w-20 rounded-full object-cover md:h-24 md:w-24"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-line font-serif text-3xl text-ink2 md:h-24 md:w-24">
                    {agent.name.slice(0, 1)}
                  </div>
                );
              })()}
              <div>
                <h1 className="display-xl">{agent.name}</h1>
                {agent.brokerage && (
                  <p className="mt-3 text-ink2 text-sm tracking-wide">{agent.brokerage}</p>
                )}
                {agent.license_no && (
                  <p className="mt-1 text-muted text-xs tracking-wide">License #{agent.license_no}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center bg-ink px-6 py-3 text-[12px] tracking-[0.18em] text-surface uppercase transition hover:bg-[#1f1f1f]"
              >
                Email {firstName}
              </a>
              {agent.phone && (
                <a
                  href={`tel:${agent.phone}`}
                  className="inline-flex items-center justify-center border border-line-strong px-6 py-3 text-[12px] tracking-[0.18em] text-ink uppercase transition hover:border-ink"
                >
                  {formatPhone(agent.phone)}
                </a>
              )}
            </div>
          </div>

          {agent.bio && (
            <p className="mt-12 max-w-2xl whitespace-pre-line text-ink2 text-base leading-[1.7]">
              {agent.bio}
            </p>
          )}
        </div>
        <hr className="hairline" />
      </section>

      {/* Listings — gallery */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <div className="mb-10 flex items-baseline justify-between">
            <div>
              <div className="eyebrow mb-3">The Portfolio</div>
              <h2 className="display-md">Selected residences</h2>
            </div>
            <span className="text-muted text-xs tracking-[0.18em] uppercase">
              {String(listings.length).padStart(2, '0')} {listings.length === 1 ? 'home' : 'homes'}
            </span>
          </div>

          {listings.length === 0 ? (
            <div className="border border-line py-20 text-center">
              <p className="text-ink2">No live listings right now.</p>
              <p className="mt-2 text-muted text-sm">
                Check back soon or reach out directly above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
              {listings.map((l, i) => (
                <ListingCardView
                  key={l.id}
                  index={i}
                  agentSlug={agent.slug}
                  listing={l}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <hr className="hairline" />
      <footer>
        <div className="mx-auto max-w-6xl px-6 py-10 text-muted text-xs tracking-wide">
          <p>
            <Link href="/" className="hover:text-ink hover:underline">
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
  index,
}: {
  agentSlug: string;
  listing: ListingCard;
  index: number;
}) {
  const realCover =
    listing.cover_url ?? (listing.hero_video_id ? thumbnailUrl(listing.hero_video_id) : null);
  const cover = demoCoverFor(listing.id, realCover);
  const isDemoStock = DEMO_MEDIA_ENABLED && cover !== realCover;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Link
      href={`/v/${agentSlug}/${listing.slug}`}
      className="group block"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={listing.address}
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted text-xs">
            No cover
          </div>
        )}
        {isDemoStock && (
          <span className="absolute top-3 right-3 bg-ink/85 px-2 py-1 text-[9px] tracking-[0.18em] text-surface uppercase backdrop-blur">
            Stock
          </span>
        )}
      </div>
      <div className="pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">No. {String(index + 1).padStart(2, '0')}</span>
          <span className="text-muted text-[11px] tracking-[0.18em] uppercase">
            {listing.city}, {listing.state}
          </span>
        </div>
        <div className="mt-3 font-serif text-2xl text-ink leading-tight tracking-[-0.012em]">
          {listing.address}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-ink text-base tracking-tight">
            {listing.price != null ? `$${formatPrice(listing.price)}` : 'Price upon request'}
          </span>
          {specs && <span className="text-ink2 text-xs tracking-wide">{specs}</span>}
        </div>
      </div>
    </Link>
  );
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
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
