/**
 * /admin/pipeline/listing-nearby — per-listing (Home) POI + bucket
 * video queue index. Rows link to /admin/pipeline/listing-nearby/[id].
 *
 * Phase 104 (2026-07-17): split out of the unified /nearby index so
 * Home and Neighborhood are peer tabs in the admin chip bar.
 *
 * Phase 108 (2026-07-17): moved rendering into <ListingNearbyTable>
 * (shared AdminTable). Community filter chips removed — Community
 * column is sortable + searchable.
 */

import { createServiceClient } from '@/lib/supabase/server';
import ListingNearbyTable, { type ListingNearbyRow } from './ListingNearbyTable';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  community_id: string | null;
  agents: { name: string; slug: string } | null;
};

async function loadListings(): Promise<ListingNearbyRow[]> {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('listings')
    .select('id, address, city, state, status, community_id, agents(name, slug)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)) as { data: DbRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const statsMap = new Map<string, { ready: number; pending: number; failed: number }>();
  if (ids.length > 0) {
    const { data: gv } = (await supabase
      .from('generated_videos')
      .select('listing_id, status')
      .eq('scope', 'listing_intent_bucket')
      .in('listing_id', ids)) as {
      data: Array<{ listing_id: string; status: string }> | null;
    };
    for (const r of gv ?? []) {
      const s = statsMap.get(r.listing_id) ?? { ready: 0, pending: 0, failed: 0 };
      if (r.status === 'ready' || r.status === 'approved') s.ready += 1;
      else if (r.status === 'failed') s.failed += 1;
      else s.pending += 1;
      statsMap.set(r.listing_id, s);
    }
  }
  return rows.map((r) => {
    const s = statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 };
    return {
      id: r.id,
      address: r.address,
      city: r.city,
      state: r.state,
      status: r.status,
      hasCommunity: !!r.community_id,
      agentName: r.agents?.name ?? null,
      ready: s.ready,
      pending: s.pending,
      failed: s.failed,
    };
  });
}

export default async function ListingNearbyIndex() {
  const rows = await loadListings();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Home Nearby</h1>
        <p className="text-ink2 mt-1 text-sm">
          Per-listing POI discovery + bucket videos. Used when a listing has no community assigned
          — POIs are fetched around the listing address directly.
        </p>
      </header>
      <ListingNearbyTable rows={rows} />
    </div>
  );
}
