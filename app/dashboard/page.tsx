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
 *
 * Phase 35.3 (2026-06-17): tab switching moved into a client island
 * (ListingsTabbedList) so the metrics block above doesn't flicker on
 * every Draft/Published/Archived flip. Server-side now loads all rows
 * for the agent in a single query (was per-tab) and hands them to the
 * island; the island filters in memory on tab change.
 */

import { DashboardMetrics } from '@/app/dashboard/_components/DashboardMetrics';
import {
  type ListingRow,
  ListingsTabbedList,
  type StatusTab,
} from '@/app/dashboard/_components/ListingsTabbedList';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<{ status?: string; archived?: string }>;
}

export default async function DashboardHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Back-compat: legacy ?archived=1 → status=archived. Default = published.
  const rawStatus = params.status ?? (params.archived === '1' ? 'archived' : 'published');
  const initialTab: StatusTab =
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

  // Phase 35.3: pull every status in one query so the client island can
  // filter in memory. Counts come from the same data set.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: allRows } = agentId
    ? ((await (supabase as any)
        .from('listings')
        .select(
          'id, slug, address, city, state, status, price, beds, baths, sqft, cover_url, updated_at',
        )
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })) as {
        data: Array<{
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
        }> | null;
      })
    : { data: [] };

  const counts: Record<StatusTab, number> = { draft: 0, published: 0, archived: 0 };
  for (const r of allRows ?? []) {
    if (r.status === 'draft' || r.status === 'published' || r.status === 'archived') {
      counts[r.status as StatusTab] += 1;
    }
  }

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by ord asc; we keep
  // the first hit per listing in JS.
  const idsNeedingCover = (allRows ?? []).filter((l) => !l.cover_url).map((l) => l.id);
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

  const rows: ListingRow[] = (allRows ?? []).map((r) => ({
    ...r,
    fallback_cover_url: fallbackCovers.get(r.id) ?? null,
  }));

  const totalRows = rows.length;
  const showOnboarding =
    totalRows === 0 && initialTab === 'published';

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        {/* Phase 35: dropped duplicate "View public profile" CTA — same link
         * already lives on the Me tab (/profile). One canonical entry.
         * Phase 35.1: scaled down for mobile — 4xl was wasting half the
         * viewport on a label nobody needs that big. */}
        <h1 className="font-serif text-2xl tracking-tight text-cream sm:text-4xl">Dashboard</h1>
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
      {showOnboarding ? (
        <section className="mb-8 grid grid-cols-1 gap-2 sm:mb-10 sm:grid-cols-3 sm:gap-5">
          <Link
            href="/dashboard/listings/new"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-4 transition hover:border-gold/40 sm:p-5"
          >
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gold sm:text-[11px]">New listing</div>
              <div className="mt-1 font-serif text-base text-cream sm:mt-2 sm:text-2xl">Add a property →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              fill="currentColor"
              className="text-gold"
              aria-hidden="true"
            >
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
            </svg>
          </Link>
          <Link
            href="/dashboard/communities"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-4 transition hover:border-gold/40 sm:p-5"
          >
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gold sm:text-[11px]">
                New community video
              </div>
              <div className="mt-1 font-serif text-base text-cream sm:mt-2 sm:text-2xl">Pick a community →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              fill="currentColor"
              className="text-gold"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </Link>
          <Link
            href="/dashboard/leads"
            className="group flex items-center justify-between rounded-2xl border border-cream/5 bg-ink2/60 p-4 transition hover:border-gold/40 sm:p-5"
          >
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gold sm:text-[11px]">Leads</div>
              <div className="mt-1 font-serif text-base text-cream sm:mt-2 sm:text-2xl">View leads →</div>
            </div>
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
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

      <ListingsTabbedList
        initialTab={initialTab}
        agentSlug={agentSlug}
        rows={rows}
        counts={counts}
      />
    </div>
  );
}
