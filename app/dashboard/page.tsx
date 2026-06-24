/**
 * Dashboard home — my listings.
 *
 * Phase 47.10 (2026-06-21): added filter chips (All / Active / Inactive)
 * and sort dropdown (Recently updated / Newest / Most viewed) via the new
 * client component DashboardListingGrid. Snapshot view counts are
 * aggregated in a single events query over all owned listings.
 *
 * Phase 47 (2026-06-21): refactored on top of shared GridPageShell +
 * ListingGrid. Same card markup as /browse — owner reported the two
 * grids "looked different"; root cause was duplicated card markup in
 * ListingsTabbedList.tsx. That file was deleted; this page now maps
 * fetched rows into ListingGridItem and renders the shared grid.
 *
 * RLS scopes the result to the calling agent's own listings.
 */

import { GridPageShell } from '@/app/_components/GridPageShell';
import {
  DashboardListingGrid,
  type DashboardItem,
} from '@/app/dashboard/_components/DashboardListingGrid';
import { isDraftAddress } from '@/app/dashboard/listings/draft';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHomePage() {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect('/login');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  const agentId = agentRow?.id ?? null;

  const { data: allRows } = agentId
    ? // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      ((await (supabase as any)
        .from('listings')
        .select(
          'id, slug, address, status, price, beds, baths, sqft, cover_url, created_at, updated_at',
        )
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })) as {
        data: Array<{
          id: string;
          slug: string;
          address: string | null;
          status: string;
          price: number | null;
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          cover_url: string | null;
          created_at: string;
          updated_at: string;
        }> | null;
      })
    : { data: [] };

  const rows = allRows ?? [];

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by ord asc; keep
  // the first hit per listing in JS.
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

  // Snapshot view counts: page_view events grouped by listing_id.
  const viewCounts = new Map<string, number>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: events } = (await (supabase as any)
      .from('events')
      .select('listing_id')
      .in('listing_id', ids)
      .eq('event_type', 'page_view')) as {
      data: Array<{ listing_id: string }> | null;
    };
    for (const e of events ?? []) {
      viewCounts.set(e.listing_id, (viewCounts.get(e.listing_id) ?? 0) + 1);
    }
  }

  const items: DashboardItem[] = rows.map((l) => {
    const isInactive = l.status === 'inactive';
    const isDraft = isDraftAddress(l.address);
    const badge = isDraft
      ? { label: 'Draft', tone: 'light' as const }
      : isInactive
        ? { label: 'Inactive', tone: 'light' as const }
        : null;
    return {
      id: l.id,
      href: `/dashboard/listings/${l.id}/edit`,
      coverUrl: l.cover_url ?? fallbackCovers.get(l.id) ?? null,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      address: isDraft ? 'Untitled draft' : l.address,
      badge,
      dimmed: isInactive,
      rawStatus: l.status,
      updatedAt: l.updated_at,
      createdAt: l.created_at,
      viewCount: viewCounts.get(l.id) ?? 0,
    };
  });

  return (
    <GridPageShell>
      <DashboardListingGrid items={items} />
    </GridPageShell>
  );
}
