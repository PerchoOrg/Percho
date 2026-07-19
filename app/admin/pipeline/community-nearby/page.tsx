/**
 * /admin/pipeline/community-nearby — per-community (Neighborhood) POI
 * + bucket video queue index. Rows link to
 * /admin/pipeline/community-nearby/[id].
 *
 * split out of the unified /nearby index.
 * moved rendering into <CommunityNearbyTable>
 * (shared AdminTable: search / sort / pagination).
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

async function loadCommunities(): Promise<CommunityNearbyRow[]> {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })
    .limit(500)) as { data: DbRow[] | null };
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

export default async function CommunityNearbyIndex() {
  const rows = await loadCommunities();
  return (
    <div className="space-y-4">
      <CommunityNearbyTable rows={rows} />
    </div>
  );
}
