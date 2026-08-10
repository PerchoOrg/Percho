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
