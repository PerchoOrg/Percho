'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import Link from 'next/link';

export type BucketJobRow = {
  id: string;
  type: 'render' | 'clip' | 'tour';
  scope: string;
  intent_bucket: string | null;
  status: string;
  cf_stream_uid: string | null;
  provider_job_id: string | null;
  storage_path: string | null;
  error: string | null;
  created_at: string;
  community_id: string | null;
  listing_id: string | null;
  photoCount: number;
};

function TypeBadge({ type }: { type: BucketJobRow['type'] }) {
  const label = type === 'render' ? 'render' : type === 'clip' ? 'clip' : 'tour';
  const cls =
    type === 'render'
      ? 'bg-ink2/15 text-ink2'
      : type === 'clip'
        ? 'bg-blue-500/15 text-blue-500'
        : 'bg-bronze/15 text-bronze';
  return (
    <span className={`inline-block w-14 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${cls}`}>
      {label}
    </span>
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

const columns: AdminColumn<BucketJobRow>[] = [
  {
    key: 'type',
    header: 'Type',
    sortValue: (r) => r.type,
    render: (r) => <TypeBadge type={r.type} />,
  },
  {
    key: 'job',
    header: 'Job',
    sortValue: (r) => r.id,
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
        {r.provider_job_id && (
          <span className="font-mono text-[10px] text-ink2">job {r.provider_job_id}</span>
        )}
      </div>
    ),
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
    header: 'Bucket / Stream',
    sortValue: (r) => r.intent_bucket ?? r.cf_stream_uid ?? r.storage_path ?? '',
    render: (r) => {
      if (r.cf_stream_uid) {
        return (
          <a
            className="font-mono text-xs text-blue-500 hover:underline"
            target="_blank"
            rel="noreferrer"
            href={`https://dash.cloudflare.com/?to=/:account/stream/videos/${r.cf_stream_uid}`}
          >
            {r.cf_stream_uid.slice(0, 10)}
          </a>
        );
      }
      if (r.storage_path) {
        return <span className="font-mono text-xs text-ink2">{r.storage_path}</span>;
      }
      return <span className="font-mono text-xs">{r.intent_bucket ?? '—'}</span>;
    },
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
];

export default function BucketJobsTable({ rows }: { rows: BucketJobRow[] }) {
  return (
    <AdminTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) =>
        `${r.id} ${r.type} ${r.scope} ${r.intent_bucket ?? ''} ${r.status} ${
          r.listing_id ?? ''
        } ${r.community_id ?? ''} ${r.cf_stream_uid ?? ''} ${r.provider_job_id ?? ''} ${
          r.error ?? ''
        }`
      }
      emptyMessage="No jobs."
      searchPlaceholder="Search jobs…"
    />
  );
}
