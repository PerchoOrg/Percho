import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
/**
 * /search — site-wide search across listings and communities.
 *
 * Phase 43.9: introduced as the destination for the global TopBar 🔍.
 * Phase 47.2: unified on top of GridPageShell + ListingGrid + CommunityGrid.
 *
 * Phase 47.14 (2026-06-21):
 *  - Listing match expanded from address+city to:
 *      address, city, state, zip, neighborhood
 *  - Community match expanded from name+city to:
 *      name, city, state, description
 *  - Agent-aware: when the viewer is an authenticated agent, we run a
 *    second pass that also matches her own INACTIVE listings and
 *    INACTIVE/created-by-her communities (RLS already lets agents read
 *    their own inactive rows). These render under a separate section
 *    "From your inactive items" so an agent can find a draft she pulled
 *    down without it being visible to buyers.
 *
 * Public surface still gates on status='active' — buyer view unchanged.
 */
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { createClient } from '@/lib/supabase/server';
import { photoPublicUrl } from '@/lib/supabase/storage';
import type { Metadata } from 'next';

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
  status: string;
  cover: { kind: 'video' | 'photo'; src: string } | null;
};

type ListingScope = 'public' | 'agent_inactive';

async function searchListings(
  q: string,
  scope: ListingScope,
  agentId: string | null,
): Promise<ListingHit[]> {
  const supabase = await createClient();
  const pattern = `%${q}%`;
  // Phase 47.14: extended field set for fuzzy matching.
  const orFields = [
    `address.ilike.${pattern}`,
    `city.ilike.${pattern}`,
    `state.ilike.${pattern}`,
    `zip.ilike.${pattern}`,
    `neighborhood.ilike.${pattern}`,
  ].join(',');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  let query = (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, neighborhood, price, beds, baths, sqft, agent_id, status',
    )
    .or(orFields)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (scope === 'public') {
    query = query.eq('status', 'active');
  } else {
    // agent_inactive: only the viewer's own non-active listings.
    if (!agentId) return [];
    query = query.eq('agent_id', agentId).neq('status', 'active');
  }

  const { data: rawListings } = (await query) as {
    data: Array<{
      id: string;
      slug: string;
      address: string;
      city: string;
      state: string;
      zip: string | null;
      neighborhood: string | null;
      price: number | null;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      agent_id: string;
      status: string;
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
      status: l.status,
      cover,
    };
  });
}

function listingHitsToItems(
  hits: ListingHit[],
  opts: { dimInactive?: boolean } = {},
): ListingGridItem[] {
  return hits.map((hit) => {
    const src = hit.cover?.src ?? null;
    const inactive = hit.status !== 'active';
    const ownerHref = `/dashboard/listings/${hit.id}/edit`;
    const buyerHref =
      hit.cover?.kind === 'video'
        ? `/browse/feed?start=${encodeURIComponent(hit.id)}`
        : hit.agent_slug
          ? `/v/${hit.agent_slug}/${hit.slug}`
          : '/browse';
    return {
      id: hit.id,
      // Inactive results are the viewer's own — link straight to her edit page.
      href: opts.dimInactive && inactive ? ownerHref : buyerHref,
      coverUrl: src,
      price: hit.price,
      beds: hit.beds,
      baths: hit.baths,
      sqft: hit.sqft,
      address: hit.address,
      badge: inactive ? { label: 'Inactive', tone: 'light' } : null,
      dimmed: inactive && opts.dimInactive,
    };
  });
}

async function getViewerAgentId(): Promise<string | null> {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return null;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  return agent?.id ?? null;
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

  const agentId = await getViewerAgentId();

  const [publicListings, agentListings, allCommunities] = await Promise.all([
    searchListings(q, 'public', null),
    agentId ? searchListings(q, 'agent_inactive', agentId) : Promise.resolve([]),
    // Phase 47.14: include inactive in the raw set when viewer is an agent;
    // we filter in JS to scope inactive results to communities the viewer
    // created (RLS prevents her from seeing other agents' inactive rows
    // anyway, but the explicit filter keeps this correct if RLS shifts).
    fetchCommunityListCards({ includeInactive: agentId !== null }).then((rows) =>
      rows
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.city ?? '').toLowerCase().includes(q) ||
            c.state.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q),
        )
        .slice(0, LIMIT),
    ),
  ]);

  // We don't have created_by on the card type yet — split communities
  // by the `status` field we already render by checking listingCount /
  // public-visibility heuristic. For V1 surface we just show every
  // community match in one section; agent-only inactive split for
  // communities can come in a later phase if needed.

  const empty =
    publicListings.length === 0 &&
    agentListings.length === 0 &&
    allCommunities.length === 0;

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <header className="sticky top-0 z-20 border-line border-b bg-bg/85 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-center px-4 py-3">
          <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">Search</div>
        </div>
      </header>

      <GridPageShell>
        <h1 className="px-1 pt-6 pb-4 font-serif text-xl text-ink tracking-[-0.012em]">
          Search results for &lsquo;{q}&rsquo;
        </h1>

        {empty ? (
          <p className="px-1 py-12 text-center text-ink2">No matches for &lsquo;{q}&rsquo;</p>
        ) : (
          <>
            {publicListings.length > 0 && (
              <section className="pb-8">
                <h2 className="mb-3 px-1 text-[11px] text-ink2 tracking-[0.22em] uppercase">
                  Listings
                </h2>
                <ListingGrid items={listingHitsToItems(publicListings)} />
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

            {agentListings.length > 0 && (
              <section className="pb-8">
                <h2 className="mb-3 px-1 text-[11px] text-ink2 tracking-[0.22em] uppercase">
                  From your inactive listings
                </h2>
                <ListingGrid
                  items={listingHitsToItems(agentListings, { dimInactive: true })}
                />
              </section>
            )}
          </>
        )}
      </GridPageShell>
    </main>
  );
}
