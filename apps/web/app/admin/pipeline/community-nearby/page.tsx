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
 * fine at a few hundred rows and silently wrong at 8686 — the window ended at
 * "Beaver Ruin Rd", so everything from Bellmoore Park on was unreachable, and
 * a search box that only sees fetched rows cannot find what was never fetched
 * (owner 2026-08-22: created a community, could not see it in the table).
 */

import { createServiceClient } from '@/lib/supabase/server';
import CommunityNearbyTable, { type CommunityNearbyRow } from './CommunityNearbyTable';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

/**
 * `q` searches the whole table; without it the page keeps the first 500 by
 * name. The cap stays on the search too — it bounds the `.in()` below, whose
 * id list rides in the URL.
 */
async function loadCommunities(q?: string): Promise<CommunityNearbyRow[]> {
  const supabase = createServiceClient();
  let select = supabase.from('communities').select('id, name, city, state');
  if (q) {
    // `.or()` wraps the filter string in parens and takes one comma-separated
    // list — a query containing a comma or a paren would be read as syntax.
    // Double-quoting the value is PostgREST's escape hatch; `%` and `_` stay
    // live wildcards, which on an admin search box is a feature.
    const v = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    select = select.or(`(name.ilike."%${v}%",city.ilike."%${v}%")`);
  }
  const { data } = (await select.order('name', { ascending: true }).limit(500)) as {
    data: DbRow[] | null;
  };
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
  return rows.map((r) => {
    const s = statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 };
    return {
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      ready: s.ready,
      pending: s.pending,
      failed: s.failed,
    };
  });
}

export default async function CommunityNearbyIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rows = await loadCommunities(q?.trim() || undefined);
  return (
    <div className="space-y-4">
      <CommunityNearbyTable rows={rows} />
    </div>
  );
}
