/**
 * /admin/pipeline/bucket-jobs — cross-scope queue view for
 * generated_videos (nearby bucket renders).
 *
 * moved rendering into <BucketJobsTable>
 * (shared AdminTable). Status filter chips removed — Status column
 * is sortable, and search covers status text too.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';
import BucketJobsTable, { type BucketJobRow } from './BucketJobsTable';

export const dynamic = 'force-dynamic';

type StatusFilter = 'all' | 'pending' | 'processing' | 'ready' | 'approved' | 'failed' | 'superseded';

type DbRow = {
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

/** Seedance worker rows (photo_clips + ai_tour_videos) — the worker enqueues
 *  these and owns the OPENROUTER_API_KEY submission loop (owner 2026-08-16). */
type SeedanceRow = {
  id: string;
  kind: 'clip' | 'tour';
  status: string;
  error: string | null;
  provider_job_id: string | null;
  created_at: string;
};

export default async function BucketJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter: StatusFilter =
    status === 'pending' ||
    status === 'processing' ||
    status === 'ready' ||
    status === 'approved' ||
    status === 'failed' ||
    status === 'superseded'
      ? status
      : 'all';

  const supabase = createServiceClient();
  let q = supabase
    .from('generated_videos')
    .select(
      'id, scope, intent_bucket, status, cf_stream_uid, duration_s, error, created_at, community_id, listing_id, input_photo_ids',
    )
    .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
    .order('created_at', { ascending: false })
    .limit(500);
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  const { data } = (await q) as { data: DbRow[] | null };

  // Seedance worker visibility: same page, so admins can see what the
  // seedance worker is draining without jumping to the community page.
  const [seedClips, seedTours] = await Promise.all([
    supabase
      .from('photo_clips')
      .select('id, status, error, provider_job_id, created_at')
      .order('created_at', { ascending: false })
      .limit(8) as unknown as Promise<{ data: SeedanceRow[] | null }>,
    supabase
      .from('ai_tour_videos')
      .select('id, status, error, provider_job_id, created_at')
      .order('created_at', { ascending: false })
      .limit(8) as unknown as Promise<{ data: SeedanceRow[] | null }>,
  ]);
  const seedanceRows: SeedanceRow[] = [
    ...(seedClips.data ?? []).map((r) => ({ ...r, kind: 'clip' as const })),
    ...(seedTours.data ?? []).map((r) => ({ ...r, kind: 'tour' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const rows: BucketJobRow[] = (data ?? []).map((r) => ({
    id: r.id,
    scope: r.scope,
    intent_bucket: r.intent_bucket,
    status: r.status,
    cf_stream_uid: r.cf_stream_uid,
    error: r.error,
    created_at: r.created_at,
    community_id: r.community_id,
    listing_id: r.listing_id,
    photoCount: r.input_photo_ids?.length ?? 0,
  }));

  return (
    <div className="space-y-4">
      <StatusFilterBar current={statusFilter} />
      <BucketJobsTable rows={rows} />
      <SeedanceSection rows={seedanceRows} />
    </div>
  );
}

function SeedanceSection({ rows }: { rows: SeedanceRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-ink2 text-xs uppercase tracking-wide">
        Seedance worker <span className="normal-case">(ai_tour_videos + photo_clips — latest 8 each)</span>
      </div>
      <div className="mt-2 space-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="flex items-center gap-3">
            <span
              className={`inline-block w-14 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${
                r.kind === 'clip' ? 'bg-ink2/15 text-ink2' : 'bg-bronze/15 text-bronze'
              }`}
            >
              {r.kind === 'clip' ? 'clip' : 'tour'}
            </span>
            <span className="font-mono text-xs text-ink2">{r.id.slice(0, 8)}</span>
            <StatusPill status={r.status} />
            {r.provider_job_id && (
              <span className="font-mono text-xs text-ink2">job {r.provider_job_id}</span>
            )}
            {r.error && (
              <span className="text-ink2 line-clamp-1 text-xs" title={r.error}>
                {r.error}
              </span>
            )}
            <span className="ml-auto text-xs text-ink2">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
        ))}
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
          : status === 'pending'
            ? 'bg-amber-500/15 text-amber-500'
            : 'bg-ink2/15 text-ink2';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function StatusFilterBar({ current }: { current: StatusFilter }) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'ready', label: 'Ready' },
    { value: 'approved', label: 'Approved' },
    { value: 'failed', label: 'Failed' },
    { value: 'superseded', label: 'Superseded' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = current === o.value;
        const href = o.value === 'all' ? '/admin/pipeline/bucket-jobs' : `?status=${o.value}`;
        return (
          <Link
            key={o.value}
            href={href}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              active
                ? 'border-ink bg-ink text-bg'
                : 'border-line bg-surface text-ink2 hover:border-ink2 hover:text-ink'
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
