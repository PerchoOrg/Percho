'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import type { SurfaceState, TourJobRow } from '@/lib/listings/tour-index';
import Link from 'next/link';

/**
 * `listing_tour_runs.status`, in the order the pipeline writes them, with the
 * label and tone the index shows.
 *
 * `review` is amber because it is the only stage waiting on the owner: the
 * photo gate stops the run until he approves or rejects, so a table of green
 * "Ready" rows with one amber "Review" row is a to-do list. Same rule as the
 * community index.
 */
const STAGES: Record<string, { label: string; rank: number; tone: string }> = {
  tagging: { label: 'Tagging', rank: 1, tone: 'text-blue-500' },
  review: { label: 'Review', rank: 2, tone: 'text-amber-500' },
  planning: { label: 'Plan', rank: 3, tone: 'text-blue-500' },
  generating: { label: 'Rendering', rank: 4, tone: 'text-blue-500' },
  assembling: { label: 'Assembling', rank: 5, tone: 'text-blue-500' },
  ready: { label: 'Ready', rank: 6, tone: 'text-emerald-500' },
  failed: { label: 'Failed', rank: 7, tone: 'text-red-500' },
};

const surfaceRank: Record<SurfaceState, number> = { failed: 1, pending: 2, ready: 3 };

const surfaceTone: Record<SurfaceState, string> = {
  ready: 'text-emerald-500',
  pending: 'text-amber-500',
  failed: 'text-red-500',
};

function Cut({ label, state }: { label: string; state: SurfaceState | null }) {
  if (!state) return null;
  return (
    <span className={`text-xs ${surfaceTone[state]}`} title={`${label}: ${state}`}>
      {label}
    </span>
  );
}

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
    // Sorted by how far through the pipeline the run got, not alphabetically:
    // "Ready" before "Failed" before "Rendering" tells you nothing. Never-run
    // rows sort last.
    key: 'stage',
    header: 'Stage',
    sortValue: (r) => (r.stage ? (STAGES[r.stage]?.rank ?? 0) : -1),
    render: (r) => {
      if (!r.stage) return <span className="text-ink2">—</span>;
      const s = STAGES[r.stage];
      return (
        <span className={s?.tone ?? 'text-ink2'}>
          {s?.label ?? r.stage}
          {r.runCount > 1 && <span className="text-ink2"> · {r.runCount} runs</span>}
        </span>
      );
    },
  },
  {
    // Tagging is the pipeline's first step, so "18 / 22" is both the photo
    // count and how far that step got.
    key: 'photos',
    header: 'Photos',
    align: 'right',
    sortValue: (r) => r.photos,
    render: (r) =>
      r.photos === 0 ? (
        <span className="text-ink2">—</span>
      ) : (
        <span title={`${r.photosTagged} of ${r.photos} tagged`}>
          <span className={r.photosTagged === r.photos ? 'text-emerald-500' : 'text-amber-500'}>
            {r.photosTagged}
          </span>
          <span className="text-ink2"> / {r.photos}</span>
        </span>
      ),
  },
  {
    // The film exists twice, one cut per surface. The old column read a single
    // `listing_videos` row, which cannot say that web is up and iOS is not.
    key: 'film',
    header: 'Film',
    sortValue: (r) => (r.web ? surfaceRank[r.web] * 10 : 0) + (r.ios ? surfaceRank[r.ios] : 0),
    render: (r) =>
      r.web || r.ios ? (
        <span className="flex gap-1.5">
          <Cut label="web" state={r.web} />
          <Cut label="ios" state={r.ios} />
        </span>
      ) : (
        <span className="text-ink2">—</span>
      ),
  },
  {
    // The page hands rows down newest-processed-first; without a time on screen
    // that order reads as random.
    key: 'activity',
    header: 'Last activity',
    align: 'right',
    sortValue: (r) => r.lastActivityAt ?? '',
    render: (r) => (
      <span className="text-ink2" title={r.lastActivityAt ?? ''}>
        {r.lastActivityLabel}
      </span>
    ),
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
      minWidth={860}
    />
  );
}
