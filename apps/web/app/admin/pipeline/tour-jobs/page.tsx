/**
 * /admin/pipeline/tour-jobs — Home Tour hub.
 *
 * reshaped from a flat listing_videos queue
 * into a per-listing index. Rows link to /admin/pipeline/tour-jobs/[id]
 * where an admin can browse all photos + tour videos for a home and
 * (re)trigger the Ken Burns render.
 *
 * moved rendering into <TourJobsTable> so the
 * shared AdminTable adds search / sort / pagination. Filter chips
 * removed — Tour column is sortable now.
 *
 * 2026-08-22: ordered by the pipeline's clock instead of the listing's, the
 * way the community index was the same day. The old order (`listings
 * .created_at desc`) meant a home rendered minutes ago sat wherever it was
 * first created, and the row said nothing about how far it had got: a raw
 * video count and a Tour word derived from `listing_videos`, which is one row
 * per home and cannot distinguish "web is up, iOS is still encoding". Rows now
 * carry tagged-photo progress, both cuts, the newest run's status and when the
 * pipeline last touched the home — see `buildTourIndexRows`.
 */

import { type TourJobRow, buildTourIndexRows } from '@/lib/listings/tour-index';
import { createServiceClient } from '@/lib/supabase/server';
import { formatAge } from '@/lib/worker-hub/format';
import TourJobsTable from './TourJobsTable';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  created_at: string;
  agents: { name: string } | null;
};

type PhotoRow = { listing_id: string; tagged_at: string | null };
type RunRow = { listing_id: string; status: string; updated_at: string | null };
type AssemblyRow = {
  listing_id: string;
  surface: string;
  status: string;
  updated_at: string | null;
};

/**
 * Every photo row for the listings on screen, in pages.
 *
 * PostgREST answers with at most 1000 rows on this project and there are 2588
 * listing photos (2026-08-22), so the single un-paged fetch this page used to
 * do silently counted zero for every home past the cap — a finished tour
 * sitting next to "0 photos". `from` advances by what actually came back, so a
 * smaller server cap pages correctly instead of stopping early.
 */
async function loadPhotos(
  supabase: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<PhotoRow[]> {
  const PAGE = 1000;
  const out: PhotoRow[] = [];
  for (let from = 0; from < 50_000; ) {
    const { data } = (await supabase
      .from('listing_photos')
      .select('listing_id, tagged_at')
      .in('listing_id', ids)
      // Paging without an order is paging over an undefined sequence.
      .order('id')
      .range(from, from + PAGE - 1)) as unknown as { data: PhotoRow[] | null };
    const batch = data ?? [];
    if (batch.length === 0) break;
    out.push(...batch);
    from += batch.length;
  }
  return out;
}

/**
 * The 500 cap is well clear of the table (265 listings, 2026-08-22), so the
 * client-side search box still sees every row it claims to search — unlike the
 * community index, which had to move its search server-side at 8.7k rows.
 */
async function loadListings(): Promise<{ rows: TourJobRow[]; total: number }> {
  const supabase = createServiceClient();
  const { data, count, error } = (await supabase
    .from('listings')
    .select('id, address, city, state, status, created_at, agents(name)', { count: 'exact' })
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)) as {
    data: ListingRow[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  // A swallowed error renders as "No listings." — a wrong answer with the same
  // pixels as an empty table (community index, 2026-08-22).
  if (error) throw new Error(`tour jobs index query failed: ${error.message}`);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { rows: [], total: count ?? 0 };

  const [photos, runRes, assemblyRes] = await Promise.all([
    loadPhotos(supabase, ids),
    supabase
      .from('listing_tour_runs')
      .select('listing_id, status, updated_at')
      .in('listing_id', ids) as unknown as Promise<{ data: RunRow[] | null }>,
    supabase
      .from('listing_tour_assemblies')
      .select('listing_id, surface, status, updated_at')
      .in('listing_id', ids) as unknown as Promise<{ data: AssemblyRow[] | null }>,
  ]);

  const now = Date.now();
  return {
    rows: buildTourIndexRows({
      listings: rows,
      photos,
      runs: runRes.data ?? [],
      assemblies: assemblyRes.data ?? [],
      // Rendered server-side: `formatAge` reads the clock, and a client render
      // of the same row would disagree with the HTML it is hydrating.
      formatActivity: (iso) => formatAge(iso, now),
    }),
    total: count ?? rows.length,
  };
}

export default async function TourJobsIndex() {
  const { rows, total } = await loadListings();
  const withRun = rows.filter((r) => r.stage !== null).length;
  const withFilm = rows.filter((r) => r.web === 'ready' && r.ios === 'ready').length;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2">
        {`Most recently processed first — ${rows.length} of ${total.toLocaleString()}`}
        {` · ${withRun} with a tour run, ${withFilm} with a finished film.`}
      </p>
      <TourJobsTable rows={rows} />
    </div>
  );
}
