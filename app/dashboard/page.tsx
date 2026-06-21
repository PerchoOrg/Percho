/**
 * Dashboard home — my listings.
 *
 * Phase 47 (2026-06-21): refactored on top of shared GridPageShell +
 * ListingGrid. Same card markup as /browse — owner reported the two
 * grids "looked different"; root cause was duplicated card markup in
 * ListingsTabbedList.tsx. That file was deleted; this page now maps
 * fetched rows into ListingGridItem and renders the shared grid.
 *
 * Phase 46 (preserved): status simplified to 'active' | 'inactive'; the
 * pill row is hidden. Inactive listings show a small "Inactive" pill in
 * the top-right and dim the cover.
 *
 * RLS scopes the result to the calling agent's own listings.
 */

import { GridPageShell } from '@/app/_components/GridPageShell';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardHomePage() {
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
  const agentId = agentRow?.id ?? null;

  const { data: allRows } = agentId
    ? // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      ((await (supabase as any)
        .from('listings')
        .select('id, slug, address, status, price, beds, baths, sqft, cover_url, updated_at')
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
          updated_at: string;
        }> | null;
      })
    : { data: [] };

  // Fallback covers: pull the first listing_video thumbnail per listing
  // when cover_url is null. One batched query ordered by ord asc; keep
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

  const items: ListingGridItem[] = (allRows ?? []).map((l) => {
    const isInactive = l.status === 'inactive';
    return {
      id: l.id,
      href: `/dashboard/listings/${l.id}/edit`,
      coverUrl: l.cover_url ?? fallbackCovers.get(l.id) ?? null,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      address: l.address,
      badge: isInactive ? { label: 'Inactive', tone: 'light' } : null,
      dimmed: isInactive,
    };
  });

  return (
    <GridPageShell>
      <ListingGrid
        items={items}
        emptyState={
          <div className="mx-auto max-w-md rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
            <p className="text-ink2 text-sm">No listings yet — tap + New listing to add one.</p>
          </div>
        }
      />
    </GridPageShell>
  );
}
