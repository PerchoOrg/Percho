/**
 * Dashboard home — my listings.
 *
 * added filter chips (All / Active / Inactive)
 * and sort dropdown (Recently updated / Newest / Most viewed) via the new
 * client component DashboardListingGrid. Snapshot view counts are
 * aggregated in a single events query over all owned listings.
 *
 * refactored on top of shared GridPageShell +
 * ListingGrid. Same card markup as /browse — owner reported the two
 * grids "looked different"; root cause was duplicated card markup in
 * ListingsTabbedList.tsx. That file was deleted; this page now maps
 * fetched rows into ListingGridItem and renders the shared grid.
 *
 * RLS scopes the result to the calling agent's own listings.
 */

import { GridPageShell } from '@/app/_components/GridPageShell';
import type { ListingGridItem } from '@/app/_components/ListingGrid';
import { DashboardListingGrid } from '@/app/dashboard/_components/DashboardListingGrid';
import { isDraftAddress } from '@/app/dashboard/listings/draft';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHomePage() {
  const supabase = await createClient();
  // getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect('/login');

  const { data: agentRow } = (await supabase
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  const agentId = agentRow?.id ?? null;

  const { data: allRows } = agentId
    ? ((await supabase
        .from('listings')
        .select('id, slug, address, city, state, zip, status, price, beds, baths, sqft, cover_url')
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })) as {
        data: Array<{
          id: string;
          slug: string;
          address: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          status: string;
          price: number | null;
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          cover_url: string | null;
        }> | null;
      })
    : { data: [] };

  const rows = allRows ?? [];

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by sort_order asc;
  // keep the first hit per listing in JS. (It asked for a column `ord` that
  // never existed, so the query errored and no fallback cover ever showed.)
  const idsNeedingCover = rows.filter((l) => !l.cover_url).map((l) => l.id);
  const fallbackCovers = new Map<string, string>();
  if (idsNeedingCover.length > 0) {
    const { data: vids } = (await supabase
      .from('listing_videos')
      .select('listing_id, cf_video_id, sort_order')
      .in('listing_id', idsNeedingCover)
      .eq('status', 'ready')
      .order('sort_order', { ascending: true })) as {
      data: Array<{ listing_id: string; cf_video_id: string | null; sort_order: number }> | null;
    };
    for (const v of vids ?? []) {
      if (!fallbackCovers.has(v.listing_id) && v.cf_video_id) {
        fallbackCovers.set(v.listing_id, thumbnailUrl(v.cf_video_id));
      }
    }
  }

  const items: ListingGridItem[] = rows.map((l) => {
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
      // Dashboard hub uses ListingGrid's formatFullAddress, which
      // needs city/state/zip. Drafts have no city/state → fall back
      // to "Untitled draft" street-only.
      city: isDraft ? null : l.city,
      state: isDraft ? null : l.state,
      zip: isDraft ? null : l.zip,
      badge,
      dimmed: isInactive,
    };
  });

  return (
    <GridPageShell>
      <DashboardListingGrid items={items} />
    </GridPageShell>
  );
}
