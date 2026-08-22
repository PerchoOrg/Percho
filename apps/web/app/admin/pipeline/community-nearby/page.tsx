/**
 * /admin/pipeline/community-nearby — the Community Tour index. Rows link to
 * /admin/pipeline/community-nearby/[id].
 *
 * split out of the unified /nearby index.
 * moved rendering into <CommunityNearbyTable>
 * (shared AdminTable: search / sort / pagination).
 *
 * 2026-08-22: search moved server-side. The index took the first 500
 * communities by name and let the table filter those in the browser. That was
 * fine at a few hundred rows and silently wrong at 8684 — the window ended at
 * "Beaver Ruin Rd", so everything from Bellmoore Park on was unreachable, and
 * a search box that only sees fetched rows cannot find what was never fetched
 * (owner 2026-08-22: created a community, could not see it in the table).
 *
 * 2026-08-22 (later): that fix shipped broken — the `.or()` string was
 * pre-wrapped in parens, so every search 400'd and the swallowed error read as
 * an empty table. Filter building now lives in `communitySearchFilter` (tested)
 * and PostgREST errors throw instead of rendering as "no results". The default
 * window is newest-touched-first too: a community you just created or edited
 * sits at the top, which is where the owner looks for it.
 *
 * 2026-08-22 (later still): the columns now describe the Community Tour.
 * "Videos" counted `generated_videos` rows with scope='community_intent_bucket'
 * — the bucket-video pipeline, 8 rows in the whole database — so every row read
 * 0/0 including the six communities with a finished film (owner: "why all rows
 * show 0/0 video"). The tour's own tables drive the index now, and
 * newest-touched-first spans BOTH the pipeline and the community record.
 */

import { communitySearchFilter } from '@/lib/communities/admin-search';
import {
  type TourActivity,
  type TourAssemblyRow,
  type TourPoiRow,
  type TourRunRow,
  foldTourActivity,
  newerTimestamp,
  sortByLastActivity,
} from '@/lib/communities/tour-index';
import { createServiceClient } from '@/lib/supabase/server';
import { formatAge } from '@/lib/worker-hub/format';
import CommunityNearbyTable, { type CommunityNearbyRow } from './CommunityNearbyTable';

export const dynamic = 'force-dynamic';

type SupabaseClient = ReturnType<typeof createServiceClient>;

type DbRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  updated_at: string | null;
};

/** How many runs / assemblies to read. Both tables are in the tens today. */
const ACTIVITY_LIMIT = 4000;

/**
 * Every community the tour pipeline has touched, folded into per-community
 * counters.
 *
 * Read whole rather than filtered to the page's window: a community with a
 * finished film is exactly the row that must show up, and it will not always
 * be among the 500 most recently updated. Both tables are small — one row per
 * run and per assembly — and `community_pois` is then filtered to the handful
 * of communities that have runs, which is what keeps that `.in()` list short.
 */
async function loadTourActivity(supabase: SupabaseClient): Promise<Map<string, TourActivity>> {
  const [runsRes, asmRes] = (await Promise.all([
    supabase
      .from('community_tour_runs')
      .select('community_id, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from('tour_assemblies')
      .select('community_id, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ])) as [
    { data: TourRunRow[] | null; error: { message: string } | null },
    { data: TourAssemblyRow[] | null; error: { message: string } | null },
  ];
  if (runsRes.error) throw new Error(`tour runs query failed: ${runsRes.error.message}`);
  if (asmRes.error) throw new Error(`tour assemblies query failed: ${asmRes.error.message}`);
  const runs = runsRes.data ?? [];
  const assemblies = asmRes.data ?? [];

  const activeIds = [...new Set([...runs, ...assemblies].map((r) => r.community_id))];
  let pois: TourPoiRow[] = [];
  if (activeIds.length > 0) {
    const { data, error } = (await supabase
      .from('community_pois')
      .select('community_id, status')
      .in('community_id', activeIds)) as {
      data: TourPoiRow[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`community POI query failed: ${error.message}`);
    pois = data ?? [];
  }

  return foldTourActivity({ runs, assemblies, pois });
}

/**
 * `q` searches the whole table; without it the page shows the 500 most
 * recently updated.
 */
async function loadCommunityWindow(
  supabase: SupabaseClient,
  q?: string,
): Promise<{ rows: DbRow[]; total: number }> {
  let select = supabase
    .from('communities')
    .select('id, name, city, state, updated_at', { count: 'exact' });
  if (q) select = select.or(communitySearchFilter(q));
  const { data, count, error } = (await select
    .order('updated_at', { ascending: false })
    .limit(500)) as {
    data: DbRow[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  // A failed query used to fall through to `rows = []`, which the table renders
  // as "No communities found" — indistinguishable from a real miss.
  if (error) throw new Error(`community index query failed: ${error.message}`);
  const rows = data ?? [];
  return { rows, total: count ?? rows.length };
}

async function loadCommunities(
  q?: string,
): Promise<{ rows: CommunityNearbyRow[]; total: number; withTour: number; withFilm: number }> {
  const supabase = createServiceClient();
  const [{ rows: windowRows, total }, activity] = await Promise.all([
    loadCommunityWindow(supabase, q),
    loadTourActivity(supabase),
  ]);

  // A community last edited weeks ago can still have been rendering an hour
  // ago, which drops it out of a window ordered by `communities.updated_at`.
  // Pull those back in — but only while browsing: during a search the window IS
  // the answer, and adding non-matching rows to it would be a wrong one.
  const rows = [...windowRows];
  if (!q) {
    const have = new Set(rows.map((r) => r.id));
    const missing = [...activity.keys()].filter((id) => !have.has(id));
    if (missing.length > 0) {
      const { data, error } = (await supabase
        .from('communities')
        .select('id, name, city, state, updated_at')
        .in('id', missing)) as {
        data: DbRow[] | null;
        error: { message: string } | null;
      };
      if (error) throw new Error(`tour community backfill failed: ${error.message}`);
      rows.push(...(data ?? []));
    }
  }

  const now = Date.now();
  const mapped: CommunityNearbyRow[] = rows.map((r) => {
    const a = activity.get(r.id);
    // With no tour rows yet, an edit to the community record is the activity.
    const lastActivityAt = newerTimestamp(a?.lastActivityAt ?? null, r.updated_at);
    return {
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      stage: a?.stage ?? null,
      runCount: a?.runCount ?? 0,
      poiCount: a?.poiCount ?? 0,
      poiApproved: a?.poiApproved ?? 0,
      videosReady: a?.videosReady ?? 0,
      videosFailed: a?.videosFailed ?? 0,
      lastActivityAt,
      // Rendered server-side: `formatAge` reads the clock, and a client render
      // of the same row would disagree with the HTML it is hydrating.
      lastActivityLabel: formatAge(lastActivityAt, now),
    };
  });

  return {
    rows: sortByLastActivity(mapped),
    total,
    withTour: mapped.filter((r) => r.runCount > 0).length,
    withFilm: mapped.filter((r) => r.videosReady > 0).length,
  };
}

export default async function CommunityNearbyIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() || undefined;
  const { rows, total, withTour, withFilm } = await loadCommunities(query);
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2">
        {query
          ? `${total.toLocaleString()} match${total === 1 ? '' : 'es'} for “${query}” across every community.`
          : `Most recently touched first — ${rows.length} of ${total.toLocaleString()}. Search to reach the rest.`}
        {` · ${withTour} with a tour run, ${withFilm} with a finished film.`}
      </p>
      <CommunityNearbyTable rows={rows} />
    </div>
  );
}
