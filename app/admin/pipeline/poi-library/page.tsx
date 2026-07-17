/**
 * /admin/pipeline/poi-library — global POI + poi_photos audit.
 * Shows what the discovery + AI-tag steps have produced.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  google_place_id: string;
  display_name: string;
  primary_type: string | null;
  rating: number | null;
  ai_summary: string | null;
  tagged_at: string | null;
  discovered_at: string;
};

export default async function PoiLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tagged?: string }>;
}) {
  const { q = '', tagged = 'all' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('pois')
    .select('id, google_place_id, display_name, primary_type, rating, ai_summary, tagged_at, discovered_at', { count: 'exact' })
    .order('discovered_at', { ascending: false })
    .limit(200);
  if (q) query = query.ilike('display_name', `%${q}%`);
  if (tagged === 'tagged') query = query.not('tagged_at', 'is', null);
  if (tagged === 'untagged') query = query.is('tagged_at', null);

  const [{ data, count }, photoAgg] = await Promise.all([
    query as unknown as Promise<{ data: Row[] | null; count: number | null }>,
    supabase.from('poi_photos').select('id', { count: 'exact', head: true }),
  ]);

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">POI Library</h1>
        <p className="text-ink2 mt-1 text-sm">
          Global `pois` table — deduped by <code className="font-mono text-xs">google_place_id</code>.
          Every listing / community references POIs by id, so the photo binaries and AI tags are
          fetched exactly once.
        </p>
        <div className="mt-3 flex gap-4 text-sm text-ink2">
          <span>
            <b className="text-ink">{count ?? 0}</b> POIs
          </span>
          <span>
            <b className="text-ink">{photoAgg.count ?? 0}</b> photos
          </span>
        </div>
      </header>

      <form className="flex flex-wrap gap-2 text-sm" action="/admin/pipeline/poi-library">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search display name…"
          className="min-w-64 rounded-lg border border-line bg-surface px-3 py-1.5"
        />
        <select
          name="tagged"
          defaultValue={tagged}
          className="rounded-lg border border-line bg-surface px-3 py-1.5"
        >
          <option value="all">All</option>
          <option value="tagged">AI-tagged</option>
          <option value="untagged">Untagged</option>
        </select>
        <button className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:border-ink">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">POI</th>
              <th className="p-3">Type</th>
              <th className="p-3 text-right">Rating</th>
              <th className="p-3">AI Summary</th>
              <th className="p-3">Tagged</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink2">
                  No POIs found.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="p-3">
                  <div className="font-medium">{r.display_name}</div>
                  <div className="text-ink2 font-mono text-xs">
                    {r.google_place_id.slice(0, 12)}…
                  </div>
                </td>
                <td className="p-3 text-ink2">{r.primary_type ?? '—'}</td>
                <td className="p-3 text-right">{r.rating ?? '—'}</td>
                <td className="p-3 text-ink2 text-xs">
                  <div className="line-clamp-2 max-w-md">{r.ai_summary ?? '—'}</div>
                </td>
                <td className="p-3 text-ink2 text-xs">
                  {r.tagged_at ? new Date(r.tagged_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
