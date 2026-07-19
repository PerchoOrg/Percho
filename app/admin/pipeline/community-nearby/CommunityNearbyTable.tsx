'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import Link from 'next/link';

export type CommunityNearbyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  ready: number;
  pending: number;
  failed: number;
};

const columns: AdminColumn<CommunityNearbyRow>[] = [
  {
    key: 'name',
    header: 'Community',
    sortValue: (r) => r.name,
    render: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: 'location',
    header: 'Location',
    sortValue: (r) => `${r.state ?? ''} ${r.city ?? ''}`,
    render: (r) => (
      <span className="text-ink2">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</span>
    ),
  },
  {
    key: 'videos',
    header: 'Videos',
    align: 'right',
    sortValue: (r) => r.ready * 1000 + r.pending * 10 + r.failed,
    render: (r) => (
      <>
        <span className="text-emerald-500">{r.ready}</span>
        <span className="text-ink2"> / </span>
        <span>{r.pending}</span>
        {r.failed > 0 && (
          <>
            <span className="text-ink2"> / </span>
            <span className="text-red-500">{r.failed}</span>
          </>
        )}
      </>
    ),
  },
  {
    key: 'open',
    header: '',
    align: 'right',
    render: (r) => (
      <Link
        href={`/admin/pipeline/community-nearby/${r.id}`}
        className="text-sm text-blue-500 hover:underline"
      >
        Open →
      </Link>
    ),
  },
];

export default function CommunityNearbyTable({ rows }: { rows: CommunityNearbyRow[] }) {
  return (
    <AdminTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.name} ${r.city ?? ''} ${r.state ?? ''}`}
      emptyMessage="No communities yet."
      searchPlaceholder="Search communities…"
    />
  );
}
