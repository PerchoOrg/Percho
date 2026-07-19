'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import Link from 'next/link';

export type TourJobRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  agentName: string | null;
  photos: number;
  totalVideos: number;
  walkthrough: 'none' | 'processing' | 'ready' | 'error';
};

const walkthroughRank: Record<TourJobRow['walkthrough'], number> = {
  none: 0,
  processing: 1,
  error: 2,
  ready: 3,
};

const columns: AdminColumn<TourJobRow>[] = [
  {
    key: 'listing',
    header: 'Listing',
    sortValue: (r) => r.address,
    render: (r) => (
      <>
        <div className="font-medium">{r.address}</div>
        <div className="text-ink2 text-xs">
          {r.city}, {r.state} · {r.status}
        </div>
      </>
    ),
  },
  {
    key: 'agent',
    header: 'Agent',
    sortValue: (r) => r.agentName ?? '',
    render: (r) => <span className="text-ink2">{r.agentName ?? '—'}</span>,
  },
  {
    key: 'photos',
    header: 'Photos',
    align: 'right',
    sortValue: (r) => r.photos,
    render: (r) => r.photos,
  },
  {
    key: 'videos',
    header: 'Videos',
    align: 'right',
    sortValue: (r) => r.totalVideos,
    render: (r) => r.totalVideos,
  },
  {
    key: 'tour',
    header: 'Tour',
    sortValue: (r) => walkthroughRank[r.walkthrough],
    render: (r) => {
      if (r.walkthrough === 'ready') return <span className="text-emerald-500 text-xs">ready</span>;
      if (r.walkthrough === 'processing')
        return <span className="text-amber-500 text-xs">processing</span>;
      if (r.walkthrough === 'error') return <span className="text-red-500 text-xs">error</span>;
      return <span className="text-ink2 text-xs">—</span>;
    },
  },
  {
    key: 'open',
    header: '',
    align: 'right',
    render: (r) => (
      <Link
        href={`/admin/pipeline/tour-jobs/${r.id}`}
        className="text-sm text-blue-500 hover:underline"
      >
        Open →
      </Link>
    ),
  },
];

export default function TourJobsTable({ rows }: { rows: TourJobRow[] }) {
  return (
    <AdminTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.address} ${r.city} ${r.state} ${r.status} ${r.agentName ?? ''}`}
      emptyMessage="No listings."
      searchPlaceholder="Search listings…"
    />
  );
}
