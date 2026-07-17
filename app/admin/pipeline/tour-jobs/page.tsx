/**
 * /admin/pipeline/tour-jobs — LISTING archetype render queue
 * (listing_videos table).
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  listing_id: string;
  cf_video_id: string | null;
  kind: string;
  title: string | null;
  duration_sec: number | null;
  status: string;
  created_at: string;
};

const STATUS_FILTERS = ['all', 'processing', 'ready', 'error'] as const;

export default async function TourJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = 'all' } = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from('listing_videos')
    .select('id, listing_id, cf_video_id, kind, title, duration_sec, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data } = (await q) as { data: Row[] | null };
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Tour Video Jobs</h1>
        <p className="text-ink2 mt-1 text-sm">
          LISTING archetype renders — the primary walkthrough / exterior tour videos on the listing
          itself.
        </p>
      </header>

      <nav className="flex gap-2 text-sm">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/admin/pipeline/tour-jobs?status=${s}`}
            className={`rounded-full border px-3 py-1 capitalize ${
              status === s
                ? 'border-ink bg-ink text-bg'
                : 'border-line text-ink2 hover:text-ink'
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">Job</th>
              <th className="p-3">Listing</th>
              <th className="p-3">Kind</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Duration</th>
              <th className="p-3">Created</th>
              <th className="p-3">Stream</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-ink2">
                  No tour jobs match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                <td className="p-3">
                  <Link
                    href={`/dashboard/listings/${r.listing_id}/edit`}
                    className="text-blue-500 hover:underline"
                  >
                    {r.listing_id.slice(0, 8)}
                  </Link>
                  {r.title && <div className="text-ink2 text-xs">{r.title}</div>}
                </td>
                <td className="p-3">{r.kind}</td>
                <td className="p-3">{r.status}</td>
                <td className="p-3 text-right text-ink2">
                  {r.duration_sec ? `${r.duration_sec}s` : '—'}
                </td>
                <td className="p-3 text-ink2 text-xs">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-3 font-mono text-xs">
                  {r.cf_video_id ? r.cf_video_id.slice(0, 10) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
