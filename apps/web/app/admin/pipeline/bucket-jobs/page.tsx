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

type StatusFilter =
  | 'all'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'approved'
  | 'failed'
  | 'superseded'
  | 'submitting';

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
  engine: string | null;
  status: string;
  error: string | null;
  provider_job_id: string | null;
  storage_path: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Tour assemblies (final concat of approved photo clips) — render worker owns
 *  these; the TourPipeline Approve button inserts the pending row. */
type AssemblyRow = {
  id: string;
  community_id: string | null;
  status: string;
  error: string | null;
  cf_stream_uid: string | null;
  created_at: string;
  updated_at: string | null;
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

  // Seedance worker rows (photo_clips + ai_tour_videos) — merged into the same
  // table with a type column so the worker's queue is visible on this page.
  const [seedClips, seedTours, assemblies] = await Promise.all([
    supabase
      .from('photo_clips')
      .select('id, engine, status, error, provider_job_id, storage_path, created_at, updated_at')
      // Ordered by LAST ACTIVITY, not creation. A clip re-rendered today sits
      // months down a created_at list: the owner ran one and found it at row
      // 31 of 79, under rows that had not moved in hours (2026-08-17).
      .order('updated_at', { ascending: false })
      .limit(100) as unknown as Promise<{ data: SeedanceRow[] | null }>,
    supabase
      .from('ai_tour_videos')
      .select('id, status, error, provider_job_id, storage_path, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100) as unknown as Promise<{ data: SeedanceRow[] | null }>,
    supabase
      .from('tour_assemblies')
      .select('id, community_id, status, error, cf_stream_uid, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100) as unknown as Promise<{ data: AssemblyRow[] | null }>,
  ]);

  const renderRows: BucketJobRow[] = (data ?? []).map((r) => ({
    id: r.id,
    type: 'render',
    scope: r.scope,
    intent_bucket: r.intent_bucket,
    status: r.status,
    cf_stream_uid: r.cf_stream_uid,
    provider_job_id: null,
    storage_path: null,
    error: r.error,
    created_at: r.created_at,
    // generated_videos has no updated_at column; creation is its only clock.
    last_activity_at: r.created_at,
    community_id: r.community_id,
    listing_id: r.listing_id,
    photoCount: r.input_photo_ids?.length ?? 0,
  }));

  const seedRows: BucketJobRow[] = [
    ...(seedClips.data ?? []).map((r) => ({
      id: r.id,
      type: 'clip' as const,
      scope: 'photo_clips',
      intent_bucket: r.engine ?? null,
      status: r.status,
      cf_stream_uid: null,
      provider_job_id: r.provider_job_id,
      storage_path: r.storage_path,
      error: r.error,
      created_at: r.created_at,
      last_activity_at: r.updated_at ?? r.created_at,
      community_id: null,
      listing_id: null,
      photoCount: 1,
    })),
    ...(seedTours.data ?? []).map((r) => ({
      id: r.id,
      type: 'tour' as const,
      scope: 'ai_tour_videos',
      intent_bucket: null,
      status: r.status,
      cf_stream_uid: null,
      provider_job_id: r.provider_job_id,
      storage_path: r.storage_path,
      error: r.error,
      created_at: r.created_at,
      last_activity_at: r.updated_at ?? r.created_at,
      community_id: null,
      listing_id: null,
      photoCount: 0,
    })),
  ].filter((r) => statusFilter === 'all' || r.status === statusFilter);

  const assemblyRows: BucketJobRow[] = (assemblies.data ?? [])
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .map((r) => ({
      id: r.id,
      type: 'assembly',
      scope: 'tour_assemblies',
      intent_bucket: null,
      status: r.status,
      cf_stream_uid: r.cf_stream_uid,
      provider_job_id: null,
      storage_path: null,
      error: r.error,
      created_at: r.created_at,
      last_activity_at: r.updated_at ?? r.created_at,
      community_id: r.community_id,
      listing_id: null,
      photoCount: 0,
    }));

  // Newest ACTIVITY first — a job you just re-ran belongs at the top even if
  // its row was created weeks ago.
  const rows = [...renderRows, ...seedRows, ...assemblyRows].sort((a, b) =>
    b.last_activity_at.localeCompare(a.last_activity_at),
  );

  return (
    <div className="space-y-4">
      <StatusFilterBar current={statusFilter} />
      <BucketJobsTable rows={rows} />
    </div>
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
    { value: 'submitting', label: 'Submitting' },
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
