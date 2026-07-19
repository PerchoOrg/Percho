'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import Link from 'next/link';

export type BucketJobRow = {
  id: string;
  scope: string;
  intent_bucket: string | null;
  status: string;
  cf_stream_uid: string | null;
  error: string | null;
  created_at: string;
  community_id: string | null;
  listing_id: string | null;
  photoCount: number;
};

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

const columns: AdminColumn<BucketJobRow>[] = [
  {
    key: 'job',
    header: 'Job',
    sortValue: (r) => r.id,
    render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>,
  },
  {
    key: 'anchor',
    header: 'Anchor',
    sortValue: (r) => (r.listing_id ? 'listing' : 'community'),
    render: (r) => {
      const anchorId = r.listing_id ?? r.community_id;
      const anchorHref = r.listing_id
        ? `/admin/pipeline/listing-nearby/${r.listing_id}`
        : r.community_id
          ? `/admin/pipeline/community-nearby/${r.community_id}`
          : null;
      return (
        <>
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
        </>
      );
    },
  },
  {
    key: 'bucket',
    header: 'Bucket',
    sortValue: (r) => r.intent_bucket ?? '',
    render: (r) => r.intent_bucket ?? '—',
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: (r) => r.status,
    render: (r) => (
      <>
        <StatusPill status={r.status} />
        {r.error && (
          <div className="text-ink2 mt-1 max-w-xs truncate text-xs" title={r.error}>
            {r.error}
          </div>
        )}
      </>
    ),
  },
  {
    key: 'photos',
    header: 'Photos',
    align: 'right',
    sortValue: (r) => r.photoCount,
    render: (r) => r.photoCount,
  },
  {
    key: 'created',
    header: 'Created',
    sortValue: (r) => r.created_at,
    render: (r) => (
      <span className="text-ink2 text-xs">{new Date(r.created_at).toLocaleString()}</span>
    ),
  },
  {
    key: 'stream',
    header: 'Stream',
    sortValue: (r) => r.cf_stream_uid ?? '',
    render: (r) =>
      r.cf_stream_uid ? (
        <a
          className="font-mono text-xs text-blue-500 hover:underline"
          target="_blank"
          rel="noreferrer"
          href={`https://dash.cloudflare.com/?to=/:account/stream/videos/${r.cf_stream_uid}`}
        >
          {r.cf_stream_uid.slice(0, 10)}
        </a>
      ) : (
        <span className="font-mono text-xs">—</span>
      ),
  },
];

export default function BucketJobsTable({ rows }: { rows: BucketJobRow[] }) {
  return (
    <AdminTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) =>
        `${r.id} ${r.scope} ${r.intent_bucket ?? ''} ${r.status} ${r.listing_id ?? ''} ${
          r.community_id ?? ''
        } ${r.cf_stream_uid ?? ''} ${r.error ?? ''}`
      }
      emptyMessage="No jobs."
      searchPlaceholder="Search jobs…"
    />
  );
}
