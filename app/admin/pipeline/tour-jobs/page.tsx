/**
 * /admin/pipeline/tour-jobs — Home Tour hub.
 *
 * Phase 104 (2026-07-17): reshaped from a flat listing_videos queue
 * into a per-listing index. Rows link to /admin/pipeline/tour-jobs/[id]
 * where an admin can browse all photos + tour videos for a home and
 * (re)trigger the Ken Burns render.
 *
 * Phase 108 (2026-07-17): moved rendering into <TourJobsTable> so the
 * shared AdminTable adds search / sort / pagination. Filter chips
 * removed — Tour column is sortable now.
 */

import { createServiceClient } from '@/lib/supabase/server';
import TourJobsTable, { type TourJobRow } from './TourJobsTable';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  agents: { name: string } | null;
};

type PhotoRow = { listing_id: string };
type VideoRow = { listing_id: string; kind: string; status: string };

async function loadListings(): Promise<TourJobRow[]> {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('listings')
    .select('id, address, city, state, status, agents(name)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)) as { data: ListingRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [photoRes, videoRes] = await Promise.all([
    supabase.from('listing_photos').select('listing_id').in('listing_id', ids) as unknown as Promise<{
      data: PhotoRow[] | null;
    }>,
    supabase
      .from('listing_videos')
      .select('listing_id, kind, status')
      .in('listing_id', ids) as unknown as Promise<{ data: VideoRow[] | null }>,
  ]);

  type S = { photos: number; totalVideos: number; walkthrough: TourJobRow['walkthrough'] };
  const stats = new Map<string, S>();
  for (const p of photoRes.data ?? []) {
    const s = stats.get(p.listing_id) ?? { photos: 0, totalVideos: 0, walkthrough: 'none' };
    s.photos += 1;
    stats.set(p.listing_id, s);
  }
  for (const v of videoRes.data ?? []) {
    const s = stats.get(v.listing_id) ?? { photos: 0, totalVideos: 0, walkthrough: 'none' };
    s.totalVideos += 1;
    if (v.kind === 'walkthrough') {
      if (v.status === 'ready' || v.status === 'approved') s.walkthrough = 'ready';
      else if (v.status === 'failed') s.walkthrough = 'error';
      else if (s.walkthrough === 'none') s.walkthrough = 'processing';
    }
    stats.set(v.listing_id, s);
  }

  return rows.map((r) => {
    const s = stats.get(r.id) ?? { photos: 0, totalVideos: 0, walkthrough: 'none' as const };
    return {
      id: r.id,
      address: r.address,
      city: r.city,
      state: r.state,
      status: r.status,
      agentName: r.agents?.name ?? null,
      photos: s.photos,
      totalVideos: s.totalVideos,
      walkthrough: s.walkthrough,
    };
  });
}

export default async function TourJobsIndex() {
  const rows = await loadListings();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Home Tour</h1>
        <p className="text-ink2 mt-1 text-sm">
          Per-listing photo + tour video hub. Click any listing to see every photo and video, and
          to trigger a fresh Ken Burns walkthrough render.
        </p>
      </header>
      <TourJobsTable rows={rows} />
    </div>
  );
}
