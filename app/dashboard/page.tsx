/**
 * Dashboard home — listings list (Phase 4.7 + Phase 8.6 polish).
 *
 * Phase 8.6: replaces the bare divider list with demo-style listing cards —
 * cover thumbnail (falls back to the first listing_video thumb), beds /
 * baths / sqft strip, status badge, per-listing stat row, public-URL pill
 * with copy-to-clipboard (or native share on mobile), and Edit / Analytics
 * actions. Matches the dark + gold demo aesthetic; the public URL is the
 * focal interaction because that's what Vivian actually shares all day.
 *
 * RLS scopes the result to the calling agent's own listings.
 */

import { CopyLinkButton } from '@/app/dashboard/_components/CopyLinkButton';
import { DashboardMetrics } from '@/app/dashboard/_components/DashboardMetrics';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

type ListingRow = {
  id: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  updated_at: string;
};

type StatusTab = 'draft' | 'published' | 'archived';

interface PageProps {
  searchParams: Promise<{ status?: string; archived?: string }>;
}

function fmtPrice(n: number | null): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtBaths(n: number | null): string | null {
  if (n == null) return null;
  // half baths display as "2½" rather than "2.5"
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac >= 0.5) return `${whole}½`;
  return `${whole}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'published'
      ? 'bg-gold/15 text-gold border-gold/30'
      : status === 'archived'
        ? 'bg-cream/5 text-cream/50 border-cream/10'
        : 'bg-bronze/15 text-cream/80 border-bronze/30';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

export default async function DashboardHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Back-compat: legacy ?archived=1 → status=archived. Default = published.
  const rawStatus = params.status ?? (params.archived === '1' ? 'archived' : 'published');
  const activeTab: StatusTab =
    rawStatus === 'draft' || rawStatus === 'archived' ? rawStatus : 'published';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  const agentSlug = agentRow?.slug ?? null;
  const agentId = agentRow?.id ?? null;

  // Counts per status — one query, group in JS. Phase 35: scoped to the
  // logged-in agent's own listings. Previously the query relied on RLS to
  // narrow rows, but RLS also exposes every *published* listing to anyone
  // (public read), so a new agent with 0 listings was seeing everyone
  // else's stuff in their dashboard counts and listing grid.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: allStatuses } = agentId
    ? ((await (supabase as any)
        .from('listings')
        .select('status')
        .eq('agent_id', agentId)) as { data: Array<{ status: string }> | null })
    : { data: [] };
  const counts = { draft: 0, published: 0, archived: 0 } as Record<StatusTab, number>;
  for (const r of allStatuses ?? []) {
    if (r.status === 'draft' || r.status === 'published' || r.status === 'archived') {
      counts[r.status as StatusTab] += 1;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const query = (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, status, price, beds, baths, sqft, cover_url, updated_at',
    )
    .eq('status', activeTab)
    .eq('agent_id', agentId ?? '00000000-0000-0000-0000-000000000000')
    .order('updated_at', { ascending: false });

  const { data: listings } = (await query) as { data: ListingRow[] | null };
  const rows = listings ?? [];

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by updated_at desc;
  // we keep the first hit per listing in JS.
  const idsNeedingCover = rows.filter((l) => !l.cover_url).map((l) => l.id);
  const fallbackCovers = new Map<string, string>();
  if (idsNeedingCover.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: vids } = (await (supabase as any)
      .from('listing_videos')
      .select('listing_id, cf_video_id, ord')
      .in('listing_id', idsNeedingCover)
      .eq('status', 'ready')
      .order('ord', { ascending: true })) as {
      data: Array<{ listing_id: string; cf_video_id: string; ord: number }> | null;
    };
    for (const v of vids ?? []) {
      if (!fallbackCovers.has(v.listing_id) && v.cf_video_id) {
        fallbackCovers.set(v.listing_id, thumbnailUrl(v.cf_video_id));
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="mb-8">
        {/* Phase 35: dropped duplicate "View public profile" CTA — same link
         * already lives on the Me tab (/profile). One canonical entry. */}
        <h1 className="font-serif text-4xl tracking-tight text-cream sm:text-5xl">Dashboard</h1>
      </div>

      {/*
        State-aware top section:
        - 0 listings (new agent) → onboarding CTA cards (Add property / Pick
          community / View leads). Bottom nav + center FAB cover the same
          actions, but new agents need the visual cue.
        - else → metrics (NEW LEADS · THIS WEEK · TOP LISTING). The CTAs are
          redundant once the agent has stuff to look at, so we replace them
          with state worth seeing.
      */}
      {rows.length === 0 && activeTab === 'published' && counts.draft === 0 && counts.archived === 0 ? (
        <section className="mb-10 grid grid-cols-3 gap-2 sm:gap-5">
          <Link
            href="/dashboard/listings/new"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-5 transition hover:border-gold/40"
          >
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gold">New listing</div>
              <div className="mt-2 font-serif text-2xl text-cream">Add a property →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="currentColor"
              className="text-gold"
              aria-hidden="true"
            >
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
            </svg>
          </Link>
          <Link
            href="/dashboard/communities"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-5 transition hover:border-gold/40"
          >
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gold">
                New community video
              </div>
              <div className="mt-2 font-serif text-2xl text-cream">Pick a community →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="currentColor"
              className="text-gold"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </Link>
          <Link
            href="/dashboard/leads"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-5 transition hover:border-gold/40"
          >
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gold">Leads</div>
              <div className="mt-2 font-serif text-2xl text-cream">View leads →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="currentColor"
              className="text-gold"
              aria-hidden="true"
            >
              <path d="M4 4h16v2H4zm0 5h16v2H4zm0 5h10v2H4z" />
            </svg>
          </Link>
        </section>
      ) : agentId ? (
        <DashboardMetrics agentId={agentId} />
      ) : null}

      <div className="mb-4 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-gold">Your Listings</div>
        <div className="flex items-center gap-2 text-xs">
          {(['draft', 'published', 'archived'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'draft' ? 'Draft' : tab === 'published' ? 'Published' : 'Archived';
            return (
              <Link
                key={tab}
                href={tab === 'published' ? '/dashboard' : `/dashboard?status=${tab}`}
                className={`rounded-full px-3 py-1 ${
                  isActive ? 'bg-bronze/30 text-cream' : 'text-cream/60 hover:text-cream'
                }`}
              >
                {label}
                {counts[tab] > 0 && (
                  <span className={`ml-1.5 ${isActive ? 'text-cream/70' : 'text-cream/40'}`}>
                    {counts[tab]}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-bronze/40 border-dashed bg-ink2 px-8 py-16 text-center">
          <p className="text-cream/70 text-sm">
            {activeTab === 'draft'
              ? 'No drafts.'
              : activeTab === 'archived'
                ? 'No archived listings.'
                : 'No published listings — publish one to share it.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => {
            const cover = l.cover_url ?? fallbackCovers.get(l.id) ?? null;
            const meta: string[] = [];
            if (l.beds != null) meta.push(`${l.beds} bd`);
            const baths = fmtBaths(l.baths);
            if (baths) meta.push(`${baths} ba`);
            if (l.sqft != null) meta.push(`${l.sqft.toLocaleString()} sqft`);
            const isPub = l.status === 'published';
            const publicPath = agentSlug ? `/v/${agentSlug}/${l.slug}` : null;
            return (
              <li
                key={l.id}
                className="flex flex-col gap-4 rounded-2xl border border-cream/5 bg-ink2/60 p-3 sm:flex-row sm:p-4"
              >
                {/*
                  Cover thumbnail is a link in all states:
                  - published → public page (new tab)
                  - draft / archived → owner-only preview at
                    /dashboard/listings/{id}/preview (banner explains state)
                  Keeps clicks alive instead of dead-ending at /v/... 404
                  for non-published rows.
                */}
                {(() => {
                  const previewHref = `/dashboard/listings/${l.id}/preview`;
                  const isExternal = isPub && !!publicPath;
                  const href = isExternal ? `${publicPath}?from=dashboard` : previewHref;
                  const titleAttr = isExternal
                    ? 'Open public listing ↗'
                    : l.status === 'archived'
                      ? 'Preview archived listing — public link is offline'
                      : 'Preview draft listing — only you can see this';
                  const overlayLabel = isExternal
                    ? 'Open ↗'
                    : l.status === 'archived'
                      ? 'Archived'
                      : 'Draft preview';
                  return (
                    <Link
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener' : undefined}
                      className="group relative h-40 w-full shrink-0 overflow-hidden rounded-xl bg-ink sm:h-28 sm:w-44"
                      title={titleAttr}
                    >
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          className={`h-full w-full object-cover transition group-hover:opacity-90 ${
                            l.status === 'archived' ? 'opacity-60' : ''
                          }`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-cream/30 text-xs">
                          No cover
                        </div>
                      )}
                      <span
                        className="pointer-events-none absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-cream/80 opacity-0 transition group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        {overlayLabel}
                      </span>
                    </Link>
                  );
                })()}

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-serif text-cream text-xl">
                      {l.address ?? '(no address)'}
                    </h3>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="mt-0.5 text-cream/60 text-sm">
                    {l.city && l.state ? `${l.city}, ${l.state}` : '—'}
                    {l.price != null && ` · ${fmtPrice(l.price)}`}
                  </p>
                  {meta.length > 0 && (
                    <p className="mt-1 text-cream/50 text-xs">{meta.join(' · ')}</p>
                  )}
                  {isPub && publicPath && (
                    <div className="mt-3">
                      <CopyLinkButton path={publicPath} display={`vicinities.cc${publicPath}`} />
                    </div>
                  )}
                  {!isPub && (
                    <div className="mt-3 text-[11px] text-cream/40 uppercase tracking-widest">
                      Publish to get a public link
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-2 sm:self-center">
                  {isPub && publicPath ? (
                    <Link
                      href={`${publicPath}?from=dashboard`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-2 text-cream text-xs hover:border-gold hover:text-gold"
                    >
                      View ↗
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/listings/${l.id}/preview`}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-2 text-cream text-xs hover:border-gold hover:text-gold"
                      title={
                        l.status === 'archived'
                          ? 'Preview archived listing'
                          : 'Preview draft listing'
                      }
                    >
                      Preview
                    </Link>
                  )}
                  <Link
                    href={`/dashboard/listings/${l.id}/edit`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-2 text-cream text-xs hover:border-gold hover:text-gold"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/dashboard/listings/${l.id}/analytics`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-bronze/40 px-3 py-2 text-cream text-xs hover:border-gold hover:text-gold"
                  >
                    Analytics
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
