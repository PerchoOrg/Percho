/**
 * /admin/pipeline/tour-jobs — Home Tour hub.
 *
 * Phase 104 (2026-07-17): reshaped from a flat listing_videos queue
 * into a per-listing index. Rows now link to
 * /admin/pipeline/tour-jobs/[id] where an admin can browse all photos
 * + tour videos for a home and (re)trigger the Ken Burns render.
 *
 * The old flat-queue view was redundant with Video Jobs (which covers
 * bucket videos); the walkthrough queue is small enough that grouping
 * by listing is more useful.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';

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

type Stat = {
  photos: number;
  walkthrough: 'none' | 'processing' | 'ready' | 'error';
  totalVideos: number;
};

async function loadListings(filter: string) {
  const supabase = createServiceClient();
  let q = supabase
    .from('listings')
    .select('id, address, city, state, status, agents(name)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter === 'no-tour') q = q; // filter post-fetch (subquery ergonomics)
  const { data } = (await q) as { data: ListingRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const stats = new Map<string, Stat>();
  if (ids.length === 0) return { rows, stats };

  const [photoRes, videoRes] = await Promise.all([
    supabase.from('listing_photos').select('listing_id').in('listing_id', ids) as unknown as Promise<{
      data: PhotoRow[] | null;
    }>,
    supabase
      .from('listing_videos')
      .select('listing_id, kind, status')
      .in('listing_id', ids) as unknown as Promise<{ data: VideoRow[] | null }>,
  ]);

  for (const p of photoRes.data ?? []) {
    const s = stats.get(p.listing_id) ?? { photos: 0, walkthrough: 'none', totalVideos: 0 };
    s.photos += 1;
    stats.set(p.listing_id, s);
  }
  for (const v of videoRes.data ?? []) {
    const s = stats.get(v.listing_id) ?? { photos: 0, walkthrough: 'none', totalVideos: 0 };
    s.totalVideos += 1;
    if (v.kind === 'walkthrough') {
      if (v.status === 'ready' || v.status === 'approved') s.walkthrough = 'ready';
      else if (v.status === 'failed') s.walkthrough = 'error';
      else if (s.walkthrough === 'none') s.walkthrough = 'processing';
    }
    stats.set(v.listing_id, s);
  }
  return { rows, stats };
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'no-tour', label: 'No tour yet' },
  { id: 'has-tour', label: 'Has tour' },
] as const;

export default async function TourJobsIndex({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = 'all' } = await searchParams;
  const { rows, stats } = await loadListings(filter);

  const filtered = rows.filter((r) => {
    const s = stats.get(r.id) ?? { photos: 0, walkthrough: 'none' as const, totalVideos: 0 };
    if (filter === 'no-tour') return s.walkthrough === 'none';
    if (filter === 'has-tour') return s.walkthrough !== 'none';
    return true;
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Home Tour</h1>
        <p className="text-ink2 mt-1 text-sm">
          Per-listing photo + tour video hub. Click any listing to see every photo and video, and
          to trigger a fresh Ken Burns walkthrough render.
        </p>
      </header>

      <nav className="flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/admin/pipeline/tour-jobs?filter=${f.id}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2 hover:text-ink'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">Listing</th>
              <th className="p-3">Agent</th>
              <th className="p-3 text-right">Photos</th>
              <th className="p-3 text-right">Videos</th>
              <th className="p-3">Tour</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink2">
                  No listings match this filter.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const s = stats.get(r.id) ?? {
                photos: 0,
                walkthrough: 'none' as const,
                totalVideos: 0,
              };
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{r.address}</div>
                    <div className="text-ink2 text-xs">
                      {r.city}, {r.state} · {r.status}
                    </div>
                  </td>
                  <td className="p-3 text-ink2">{r.agents?.name ?? '—'}</td>
                  <td className="p-3 text-right">{s.photos}</td>
                  <td className="p-3 text-right">{s.totalVideos}</td>
                  <td className="p-3">
                    {s.walkthrough === 'ready' && (
                      <span className="text-emerald-500 text-xs">ready</span>
                    )}
                    {s.walkthrough === 'processing' && (
                      <span className="text-amber-500 text-xs">processing</span>
                    )}
                    {s.walkthrough === 'error' && (
                      <span className="text-red-500 text-xs">error</span>
                    )}
                    {s.walkthrough === 'none' && (
                      <span className="text-ink2 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/admin/pipeline/tour-jobs/${r.id}`}
                      className="text-sm text-blue-500 hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
