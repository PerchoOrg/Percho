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

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        {/* Phase 35: dropped duplicate "View public profile" CTA — same link
         * already lives on the Me tab (/profile). One canonical entry.
         * Phase 35.1: scaled down for mobile — 4xl was wasting half the
         * viewport on a label nobody needs that big.
         * Phase 36.2 (2026-06-18): sub-nav chips below the heading. /dashboard
         * (listings) is the bottom-nav landing surface; /dashboard/communities
         * and /dashboard/leads need a stable in-app entry once onboarding
         * empty-state cards stop rendering. Tianrou flagged the missing
         * communities entry directly.
         * Phase 36.3 (2026-06-18): unified per-tab CTA — header gets a single
         * gold pill "+ New listing". Replaces the old 3-card onboarding row
         * (duplicated sub-nav navigation) AND the global agent FAB
         * (duplicated this CTA + community upload). Each Workspace sub-nav
         * surface owns exactly one creation CTA in the same gold-pill style.
         * Phase 36.3.1 (2026-06-18): Tianrou — CTA moved into the sub-nav row
         * (right side, smaller pill matching chip dimensions). Putting it
         * next to "Workspace" made it read like a Workspace-global action,
         * not a Listings-tab action; layered next to the active chip the
         * scope is unambiguous.
         */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl tracking-tight text-ink sm:text-4xl">Listings</h1>
        <Link
          href="/dashboard/listings/new"
          className="rounded-full border border-line-strong bg-ink px-3 py-1.5 font-medium text-cream text-xs transition hover:opacity-90 sm:text-sm"
        >
          + New listing
        </Link>
      </div>
      </div>

      {/* Metrics row — only meaningful once the agent has listings. With zero
       * listings every metric is "—", which is just noise; the empty-state
       * inside <ListingsTabbedList> already tells the new agent what to do. */}
      {totalRows > 0 && agentId ? <DashboardMetrics agentId={agentId} /> : null}

      <ListingsTabbedList
        initialTab={initialTab}
        agentSlug={agentSlug}
        rows={rows}
        counts={counts}
        view="grid"
      />
    </div>
  );
}
