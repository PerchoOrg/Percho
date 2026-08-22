/**
 * /admin/pipeline/community-nearby — per-community (Neighborhood) POI
 * + bucket video queue index. Rows link to
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
 */

import { communitySearchFilter } from '@/lib/communities/admin-search';
import { createServiceClient } from '@/lib/supabase/server';
import CommunityNearbyTable, { type CommunityNearbyRow } from './CommunityNearbyTable';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  updated_at: string | null;
};

/**
 * `q` searches the whole table; without it the page shows the 500 most
 * recently updated. The cap stays on the search too — it bounds the `.in()`
 * below, whose id list rides in the URL.
 */
async function loadCommunities(q?: string): Promise<{ rows: CommunityNearbyRow[]; total: number }> {
  const supabase = createServiceClient();
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
  const ids = rows.map((r) => r.id);
  const statsMap = new Map<string, { ready: number; pending: number; failed: number }>();
  if (ids.length > 0) {
    const { data: gv } = (await supabase
      .from('generated_videos')
      .select('community_id, status')
      .eq('scope', 'community_intent_bucket')
      .in('community_id', ids)) as {
      data: Array<{ community_id: string; status: string }> | null;
    };
    for (const r of gv ?? []) {
      const s = statsMap.get(r.community_id) ?? { ready: 0, pending: 0, failed: 0 };
      if (r.status === 'ready' || r.status === 'approved') s.ready += 1;
      else if (r.status === 'failed') s.failed += 1;
      else s.pending += 1;
      statsMap.set(r.community_id, s);
    }
  }
  return {
    rows: rows.map((r) => {
      const s = statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 };
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        updatedAt: r.updated_at,
        ready: s.ready,
        pending: s.pending,
        failed: s.failed,
      };
    }),
    total: count ?? rows.length,
  };
}

export default async function CommunityNearbyIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() || undefined;
  const { rows, total } = await loadCommunities(query);
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2">
        {query
          ? `${total.toLocaleString()} match${total === 1 ? '' : 'es'} for “${query}” across every community.`
          : `Most recently updated first — ${rows.length} of ${total.toLocaleString()}. Search to reach the rest.`}
      </p>
      <CommunityNearbyTable rows={rows} />
    </div>
  );
}
