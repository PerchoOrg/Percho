'use client';

import Link from 'next/link';
import { AdminTable, type AdminColumn } from '@/app/admin/_components/AdminTable';

export type PoiRow = {
  id: string;
  google_place_id: string;
  display_name: string;
  primary_type: string | null;
  rating: number | null;
  ai_summary: string | null;
  tagged_at: string | null;
  hasPhotos: boolean;
};

const columns: AdminColumn<PoiRow>[] = [
  {
    key: 'poi',
    header: 'POI',
    sortValue: (r) => r.display_name,
    render: (r) => (
      <>
        <div className="font-medium">{r.display_name}</div>
        <div className="text-ink2 font-mono text-xs">{r.google_place_id.slice(0, 12)}…</div>
      </>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    sortValue: (r) => r.primary_type ?? '',
    render: (r) => <span className="text-ink2">{r.primary_type ?? '—'}</span>,
  },
  {
    key: 'rating',
    header: 'Rating',
    align: 'right',
    sortValue: (r) => r.rating,
    render: (r) => (r.rating ?? '—'),
  },
  {
    key: 'ai_summary',
    header: 'AI Summary',
    sortValue: (r) => r.ai_summary ?? '',
    render: (r) => (
      <div className="text-ink2 line-clamp-2 max-w-md text-xs">{r.ai_summary ?? '—'}</div>
    ),
  },
  {
    key: 'photos',
    header: 'Photos',
    sortValue: (r) => (r.hasPhotos ? 1 : 0),
    render: (r) =>
      r.hasPhotos ? (
        <span className="text-emerald-500 text-xs">yes</span>
      ) : (
        <span className="text-ink2 text-xs">—</span>
      ),
  },
  {
    key: 'tagged',
    header: 'Tagged',
    sortValue: (r) => r.tagged_at ?? '',
    render: (r) => (
      <span className="text-ink2 text-xs">
        {r.tagged_at ? new Date(r.tagged_at).toLocaleDateString() : '—'}
      </span>
    ),
  },
  {
    key: 'open',
    header: '',
    align: 'right',
    render: (r) => (
      <Link
        href={`/admin/pipeline/poi-library/${r.id}`}
        className="text-sm text-blue-500 hover:underline"
      >
        Review →
      </Link>
    ),
  },
];

export default function PoiLibraryTable({ rows }: { rows: PoiRow[] }) {
  return (
    <AdminTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      searchable={(r) =>
        `${r.display_name} ${r.google_place_id} ${r.primary_type ?? ''} ${r.ai_summary ?? ''}`
      }
      emptyMessage="No POIs found."
      searchPlaceholder="Search POIs…"
    />
  );
}
