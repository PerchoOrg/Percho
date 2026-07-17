/**
 * /admin/pipeline/community-nearby — per-community (Neighborhood) POI
 * + bucket video queue index. Rows link to
 * /admin/pipeline/community-nearby/[id].
 *
 * Phase 104 (2026-07-17): split out of the unified /nearby index.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type CommunityRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type ScopeStat = { ready: number; pending: number; failed: number };

async function loadCommunities() {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })
    .limit(200)) as { data: CommunityRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const statsMap = new Map<string, ScopeStat>();
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
  return rows.map((r) => ({
    ...r,
    stats: statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 },
  }));
}

export default async function CommunityNearbyIndex() {
  const rows = await loadCommunities();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Neighborhood Nearby</h1>
        <p className="text-ink2 mt-1 text-sm">
          Per-community POI discovery + bucket videos. Shared by every listing inside the
          community — POIs are fetched around the subdivision entrance.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">Community</th>
              <th className="p-3">Location</th>
              <th className="p-3 text-right">Videos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink2">
                  No communities yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-ink2">
                  {[r.city, r.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="p-3 text-right">
                  <span className="text-emerald-500">{r.stats.ready}</span>
                  <span className="text-ink2"> / </span>
                  <span>{r.stats.pending}</span>
                  {r.stats.failed > 0 && (
                    <>
                      <span className="text-ink2"> / </span>
                      <span className="text-red-500">{r.stats.failed}</span>
                    </>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/admin/pipeline/community-nearby/${r.id}`}
                    className="text-sm text-blue-500 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
