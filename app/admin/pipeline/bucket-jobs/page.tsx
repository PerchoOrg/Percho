/**
 * /admin/pipeline/bucket-jobs — cross-scope queue view for
 * generated_videos (nearby bucket renders).
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  scope: string;
  intent_bucket: string | null;
  status: string;
  cf_stream_uid: string | null;
  duration_s: number | null;
  error: string | null;
  created_at: string;
  community_id: string | null;
  listing_id: string | null;
  input_photo_ids: string[] | null;
};

const STATUS_FILTERS = ['all', 'pending', 'processing', 'ready', 'failed'] as const;

export default async function BucketJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = 'all' } = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from('generated_videos')
    .select(
      'id, scope, intent_bucket, status, cf_stream_uid, duration_s, error, created_at, community_id, listing_id, input_photo_ids',
    )
    .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data } = (await q) as { data: Row[] | null };
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Bucket Video Jobs</h1>
        <p className="text-ink2 mt-1 text-sm">
          Nearby bucket renders across every listing + community. The render worker polls this
          table every {process.env.RENDER_WORKER_POLL_SEC ?? '5'} s.
        </p>
      </header>

      <nav className="flex gap-2 text-sm">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/admin/pipeline/bucket-jobs?status=${s}`}
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

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">Job</th>
              <th className="p-3">Anchor</th>
              <th className="p-3">Bucket</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Photos</th>
              <th className="p-3">Created</th>
              <th className="p-3">Stream</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-ink2">
                  No jobs match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const anchorId = r.listing_id ?? r.community_id;
              const anchorHref = r.listing_id
                ? `/admin/pipeline/listing-nearby/${r.listing_id}`
                : r.community_id
                  ? `/admin/pipeline/community-nearby/${r.community_id}`
                  : null;
              return (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="p-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                  <td className="p-3">
                    <div className="text-ink2 text-xs">
                      {r.scope === 'listing_intent_bucket' ? 'listing' : 'community'}
                    </div>
                    {anchorHref ? (
                      <Link href={anchorHref} className="text-blue-500 hover:underline">
                        {anchorId?.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-ink2">—</span>
                    )}
                  </td>
                  <td className="p-3">{r.intent_bucket ?? '—'}</td>
                  <td className="p-3">
                    <StatusPill status={r.status} />
                    {r.error && (
                      <div className="text-ink2 mt-1 max-w-xs truncate text-xs" title={r.error}>
                        {r.error}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">{r.input_photo_ids?.length ?? 0}</td>
                  <td className="p-3 text-ink2 text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {r.cf_stream_uid ? (
                      <a
                        className="text-blue-500 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://dash.cloudflare.com/?to=/:account/stream/videos/${r.cf_stream_uid}`}
                      >
                        {r.cf_stream_uid.slice(0, 10)}
                      </a>
                    ) : (
                      '—'
                    )}
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

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'ready' || status === 'approved'
      ? 'bg-emerald-500/15 text-emerald-500'
      : status === 'failed'
        ? 'bg-red-500/15 text-red-500'
        : status === 'processing'
          ? 'bg-blue-500/15 text-blue-500'
          : 'bg-ink2/15 text-ink2';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
