import { CommunityGrid } from '@/app/_components/CommunityGrid';
/**
 * /search — basic site-wide search across listings and communities.
 *
 * Phase 43.9 (2026-06-20): introduced as the destination for the new
 * mobile SearchPill. Server-renders two grids (listings + communities)
 * with simple ILIKE matching on `address`/`city` and `name`/`city`
 * respectively. Sanitised input only — no user-controlled patterns,
 * no LIKE injection.
 */
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { DEMO_MEDIA_ENABLED, demoCoverFor } from '@/lib/demo-media';
import { createClient } from '@/lib/supabase/server';
import { photoPublicUrl } from '@/lib/supabase/storage';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Search · Vicinity',
};

export const dynamic = 'force-dynamic';

const MAX_LEN = 40;
const LIMIT = 24;

function sanitise(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .trim()
    .slice(0, MAX_LEN)
    .replace(/[^a-z0-9 -]/g, '')
    .trim();
}

type ListingHit = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  agent_slug: string;
  cover: { kind: 'video' | 'photo'; src: string } | null;
};

async function searchListings(q: string): Promise<ListingHit[]> {
  const supabase = await createClient();
  const pattern = `%${q}%`;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rawListings } = (await (supabase as any)
    .from('listings')
    .select('id, slug, address, city, state, price, beds, baths, sqft, agent_id')
    .eq('status', 'published')
    .or(`address.ilike.${pattern},city.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(LIMIT)) as {
    data: Array<{
      id: string;
      slug: string;
      address: string;
      city: string;
      state: string;
      price: number | null;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      agent_id: string;
    }> | null;
  };

  const listings = rawListings ?? [];
  if (listings.length === 0) return [];

  const ids = listings.map((l) => l.id);
  const agentIds = Array.from(new Set(listings.map((l) => l.agent_id)));

  const [vidsResp, photosResp, agentsResp] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listing_videos')
      .select('listing_id, cf_video_id, sort_order')
      .in('listing_id', ids)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true }),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('listing_photos')
      .select('listing_id, storage_path, sort_order')
      .in('listing_id', ids)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })
      .then(
        (r: { data: Array<{ listing_id: string; storage_path: string }> | null }) => r,
        () => ({ data: [] }),
      ),
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('agents')
      .select('id, slug')
      .in('id', agentIds),
  ]);

  const heroVid = new Map<string, string>();
  for (const v of (vidsResp.data ?? []) as Array<{ listing_id: string; cf_video_id: string }>) {
    if (!heroVid.has(v.listing_id)) heroVid.set(v.listing_id, v.cf_video_id);
  }
  const heroPhoto = new Map<string, string>();
  for (const p of (photosResp.data ?? []) as Array<{ listing_id: string; storage_path: string }>) {
    if (!heroPhoto.has(p.listing_id)) heroPhoto.set(p.listing_id, p.storage_path);
  }
  const agentSlugs = new Map<string, string>();
  for (const a of (agentsResp.data ?? []) as Array<{ id: string; slug: string }>) {
    agentSlugs.set(a.id, a.slug);
  }

  return listings.map((l) => {
    const vid = heroVid.get(l.id);
    const ph = heroPhoto.get(l.id);
    let cover: ListingHit['cover'] = null;
    if (vid) cover = { kind: 'video', src: thumbnailUrl(vid) };
    else if (ph) cover = { kind: 'photo', src: photoPublicUrl(ph) };
    return {
      id: l.id,
      slug: l.slug,
      address: l.address,
      city: l.city,
      state: l.state,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      agent_slug: agentSlugs.get(l.agent_id) ?? '',
      cover,
    };
  });
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}

function ListingCard({ hit, idx }: { hit: ListingHit; idx: number }) {
  const realSrc = hit.cover?.src ?? null;
  const src = realSrc ? (demoCoverFor(hit.id, realSrc) as string) : null;
  const isDemoStock = DEMO_MEDIA_ENABLED && src !== null && src !== realSrc;
  const href =
    hit.cover?.kind === 'video'
      ? `/browse/feed?start=${encodeURIComponent(hit.id)}`
      : hit.agent_slug
        ? `/v/${hit.agent_slug}/${hit.slug}`
        : `/browse`;
  return (
    <Link href={href} prefetch={false} className="group block">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
        {src ? (
          <>
            <Image
              src={src}
              alt={hit.address}
              fill
              sizes="50vw"
              priority={idx < 4}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />
            {isDemoStock && (
              <span className="absolute top-2 right-2 bg-ink/85 px-1.5 py-0.5 text-[8px] tracking-[0.18em] text-surface uppercase backdrop-blur">
                Stock
              </span>
            )}
          </>
        ) : null}
      </div>
      <div className="pt-3">
        <div className="font-serif text-base text-ink leading-tight tracking-[-0.012em]">
          {formatPrice(hit.price)}
        </div>
        <div className="mt-1 truncate text-ink2 text-[12px]">{hit.address}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
          {hit.beds != null && <span>{hit.beds} bd</span>}
          {hit.baths != null && <span>· {hit.baths} ba</span>}
          {hit.sqft != null && <span>· {hit.sqft.toLocaleString()} sqft</span>}
        </div>
      </div>
    </Link>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = sanitise(rawQ);

  if (!q) {
    return (
      <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
        <header className="sticky top-0 z-20 border-line border-b bg-bg/85 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-center px-4 py-3">
            <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">Search</div>
          </div>
        </header>
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-ink2">Search listings and communities</p>
        </div>
      </main>
    );
  }

  const [listings, allCommunities] = await Promise.all([
    searchListings(q),
    // Reuse existing loader (no search arg). Filter in JS — community list is
    // small in V1; if it grows, push the filter into a dedicated query.
    fetchCommunityListCards().then((rows) =>
      rows
        .filter((c) => c.name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q))
        .slice(0, LIMIT),
    ),
  ]);

  const empty = listings.length === 0 && allCommunities.length === 0;

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <header className="sticky top-0 z-20 border-line border-b bg-bg/85 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-center px-4 py-3">
          <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">Search</div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
        <h1 className="px-1 pt-6 pb-4 font-serif text-xl text-ink tracking-[-0.012em]">
          Search results for &lsquo;{q}&rsquo;
        </h1>

        {empty ? (
          <p className="px-1 py-12 text-center text-ink2">No matches for &lsquo;{q}&rsquo;</p>
        ) : (
          <>
            {listings.length > 0 && (
              <section className="pb-8">
                <h2 className="mb-3 px-1 text-[11px] text-ink2 tracking-[0.22em] uppercase">
                  Listings
                </h2>
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12">
                  {listings.map((hit, idx) => (
                    <ListingCard key={hit.id} hit={hit} idx={idx} />
                  ))}
                </div>
              </section>
            )}

            {allCommunities.length > 0 && (
              <section className="pb-8">
                <h2 className="mb-3 px-1 text-[11px] text-ink2 tracking-[0.22em] uppercase">
                  Communities
                </h2>
                <CommunityGrid communities={allCommunities} />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
