/**
 * /admin/pipeline/community-nearby — index of communities with their
 * bucket-video counts, gateway into the shared community nearby panel.
 */

import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export default async function CommunityNearbyIndex() {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })
    .limit(200)) as { data: Row[] | null };
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Community Nearby</h1>
        <p className="text-ink2 mt-1 text-sm">
          POI discovery + bucket videos aggregated per community. Every listing inside a community
          shares the same nearby videos.
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
            {rows.map((r) => {
              const s = statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 };
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-ink2">
                    {[r.city, r.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="p-3 text-right">
                    <span className="text-emerald-500">{s.ready}</span>
                    <span className="text-ink2"> / </span>
                    <span>{s.pending}</span>
                    {s.failed > 0 && (
                      <>
                        <span className="text-ink2"> / </span>
                        <span className="text-red-500">{s.failed}</span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
