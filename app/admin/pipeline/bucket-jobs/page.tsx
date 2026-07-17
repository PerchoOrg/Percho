/**
 * /admin/pipeline/bucket-jobs — cross-scope queue view for
 * generated_videos (nearby bucket renders).
 *
 * Phase 108 (2026-07-17): moved rendering into <BucketJobsTable>
 * (shared AdminTable). Status filter chips removed — Status column
 * is sortable, and search covers status text too.
 */

import { createServiceClient } from '@/lib/supabase/server';
import BucketJobsTable, { type BucketJobRow } from './BucketJobsTable';

export const dynamic = 'force-dynamic';

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

export default async function BucketJobsPage() {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('generated_videos')
    .select(
      'id, scope, intent_bucket, status, cf_stream_uid, duration_s, error, created_at, community_id, listing_id, input_photo_ids',
    )
    .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
    .order('created_at', { ascending: false })
    .limit(500)) as { data: DbRow[] | null };

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
      <header>
        <h1 className="text-2xl font-semibold">Bucket Video Jobs</h1>
        <p className="text-ink2 mt-1 text-sm">
          Nearby bucket renders across every listing + community. The render worker polls this table
          every {process.env.RENDER_WORKER_POLL_SEC ?? '5'} s.
        </p>
      </header>
      <BucketJobsTable rows={rows} />
    </div>
  );
}
