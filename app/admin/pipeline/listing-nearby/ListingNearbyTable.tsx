'use client';

import Link from 'next/link';
import { AdminTable, type AdminColumn } from '@/app/admin/_components/AdminTable';

export type ListingNearbyRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  hasCommunity: boolean;
  agentName: string | null;
  ready: number;
  pending: number;
  failed: number;
};

const columns: AdminColumn<ListingNearbyRow>[] = [
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
    key: 'community',
    header: 'Community',
    sortValue: (r) => (r.hasCommunity ? 1 : 0),
    render: (r) =>
      r.hasCommunity ? (
        <span className="text-ink2 text-xs">community-scoped</span>
      ) : (
        <span className="text-xs text-amber-500">unassigned</span>
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
        href={`/admin/pipeline/listing-nearby/${r.id}`}
        className="text-sm text-blue-500 hover:underline"
      >
        Open →
      </Link>
    ),
  },
];

export default function ListingNearbyTable({ rows }: { rows: ListingNearbyRow[] }) {
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
