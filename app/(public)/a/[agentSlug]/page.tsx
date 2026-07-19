/**
 * Public agent profile page — `/a/[agentSlug]`.
 *
 * redesigned in Aman direction (warm cream, no gold).
 * The profile is now the centerpiece "gallery" experience — Vivian's listings
 * presented like a Pixieset portfolio: full-bleed cover, large serif address,
 * tracked-caps eyebrow, hairline dividers, generous whitespace.
 *
 * RLS / data load unchanged — see DESIGN.md for the token reference.
 */

import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
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
  /** Agent portfolio address line, aligned with the rest of the site:
   *  renders `${street}, ${city}, ${state} ${zip}` with a fallback when
   *  zip is missing. */
  zip: string | null;
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
    .select('id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, created_at')
    .eq('agent_id', agentId)
    .eq('status', 'active')
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
  if (!agent) return { title: 'Agent not found | Percho' };
  const brokerage = agent.brokerage ?? 'Percho';
  return {
    title: `${agent.name} — ${brokerage} | Percho`,
    description: agent.bio ?? `See ${agent.name}'s listings on Percho.`,
    openGraph: {
      title: `${agent.name} — ${brokerage}`,
      description: agent.bio ?? `${agent.name}'s listings on Percho.`,
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
      {/* Hero — Aman idiom: eyebrow caps + serif name + hairline. Owner
          asked to compress the hero so the portfolio grid shows more homes
          above the fold. Vertical padding halved (py-20/28 → py-8/12),
          eyebrow mb-8 → mb-3, headshot / row gap-8 → gap-5, bio mt-8 → mt-4.
          Same information density, roughly 40% less whitespace. */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-8 md:py-12">
          <div className="eyebrow mb-3">Percho · Listing Specialist</div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-5 md:items-end">
              {(() => {
                const headshot = agent.headshot_url;
                return headshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headshot}
                    alt={agent.name}
                    className="h-16 w-16 rounded-full object-cover md:h-20 md:w-20"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line font-serif text-2xl text-ink2 md:h-20 md:w-20">
                    {agent.name.slice(0, 1)}
                  </div>
                );
              })()}
              <div>
                <h1 className="display-md md:display-xl">{agent.name}</h1>
                {agent.brokerage && (
                  <p className="mt-1.5 text-ink2 text-sm tracking-wide">{agent.brokerage}</p>
                )}
                {agent.license_no && (
                  <p className="mt-0.5 text-muted text-xs tracking-wide">
                    License #{agent.license_no}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-[11px] tracking-[0.18em] text-surface uppercase transition hover:bg-[#1f1f1f]"
              >
                Email {firstName}
              </a>
              {agent.phone && (
                <a
                  href={`tel:${agent.phone}`}
                  className="inline-flex items-center justify-center border border-line-strong px-5 py-2.5 text-[11px] tracking-[0.18em] text-ink uppercase transition hover:border-ink"
                >
                  {formatPhone(agent.phone)}
                </a>
              )}
            </div>
          </div>

          {agent.bio && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-ink2 text-[15px] leading-[1.65]">
              {agent.bio}
            </p>
          )}
        </div>
        <hr className="hairline" />
      </section>

      {/* Listings — gallery. Switched from the editorial 22/26 serif
          `ListingCardView` (3-col, 4:5, gap-8) to the site-wide `ListingGrid`
          (4-up, 15/11/11 canonical). Owner asked the public profile grid to
          match the rest of the site and surface more homes per row. This
          overrides the earlier editorial exception — portfolio now matches
          browse / dashboard / community. Section vertical rhythm also
          halved to bring the grid up. */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-8 md:py-12">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <div className="eyebrow mb-2">The Portfolio</div>
              <h2 className="display-md">Selected residences</h2>
            </div>
            <span className="text-muted text-xs tracking-[0.18em] uppercase">
              {String(listings.length).padStart(2, '0')} {listings.length === 1 ? 'home' : 'homes'}
            </span>
          </div>

          <ListingGrid items={listings.map((l) => toGridItem(l, agent.slug))} />
        </div>
      </section>

      {/* Footer */}
      <hr className="hairline" />
      <footer>
        <div className="mx-auto max-w-6xl px-6 py-8 text-muted text-xs tracking-wide">
          <p>
            <Link href="/" className="hover:text-ink hover:underline">
              Percho
            </Link>{' '}
            · Equal Housing Opportunity. All listings shown are submitted by the agent and are
            subject to verification.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * portfolio → ListingGrid adapter.
 * Full-digit price via ListingGrid's own `fmtPrice` (no K/M — buyer-surface
 * hard rule from 74.10). Address expands to `street, city, state` inside the
 * grid card (74.7 canonical, no zip in dense grid).
 */
function toGridItem(listing: ListingCard, agentSlug: string): ListingGridItem {
  const cover =
    listing.cover_url ?? (listing.hero_video_id ? thumbnailUrl(listing.hero_video_id) : null);
  return {
    id: listing.id,
    href: `/v/${agentSlug}/${listing.slug}`,
    coverUrl: cover,
    price: listing.price,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
  };
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
