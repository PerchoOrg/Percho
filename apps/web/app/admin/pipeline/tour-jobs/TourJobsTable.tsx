'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import { PROGRESS_RANK, type SurfaceState, type TourJobRow } from '@/lib/listings/tour-index';
import Link from 'next/link';

/**
 * `listing_tour_runs.status` → what the index calls it, and in what colour.
 * The order comes from `PROGRESS_RANK`, so the column sorts by how far the run
 * got and there is one definition of that order.
 *
 * `review` is amber because it is the only stage waiting on the owner: the
 * photo gate stops the run until he approves or rejects, so a table of green
 * "Ready" rows with one amber "Review" row is a to-do list. Same rule as the
 * community index.
 */
const STAGES: Record<string, { label: string; tone: string }> = {
  tagging: { label: 'Tagging', tone: 'text-blue-500' },
  review: { label: 'Review', tone: 'text-amber-500' },
  planning: { label: 'Plan', tone: 'text-blue-500' },
  generating: { label: 'Rendering', tone: 'text-blue-500' },
  assembling: { label: 'Assembling', tone: 'text-blue-500' },
  ready: { label: 'Ready', tone: 'text-emerald-500' },
  failed: { label: 'Failed', tone: 'text-red-500' },
  abandoned: { label: 'Abandoned', tone: 'text-ink2' },
};

const stageLabel = (status: string): string => STAGES[status]?.label ?? status;

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
    sortValue: (r) => (r.stage ? (PROGRESS_RANK[r.stage] ?? 0) : -1),
    render: (r) => {
      if (!r.stage) return <span className="text-ink2">—</span>;
      const s = STAGES[r.stage];
      return (
        <>
          <div className={s?.tone ?? 'text-ink2'}>{s?.label ?? r.stage}</div>
          {/* A re-run that has not got as far as the home already is. Grey and
              secondary on purpose: it is in flight, not the home's state. */}
          {r.rerunStage && (
            <div className="text-ink2 text-xs">rerun in {stageLabel(r.rerunStage)}</div>
          )}
        </>
      );
    },
  },
  {
    /**
     * Three questions, one live at a time.
     *
     * Once a cut exists the answer that matters is how many photos are IN it —
     * the plan drops most of them (5122 Lower Creek Street: 75 photos, 20 in
     * the film). "75 / 75" read as "75 photos in the video", which is what the
     * owner asked about on 2026-08-23.
     *
     * The plan stamps its picks whether or not a film ever gets assembled, so
     * a picked count with no ready cut says "picked", not "in film" — 3855 Oak
     * Park Drive planned 9 shots and has no film at all.
     */
    key: 'photos',
    header: 'Photos',
    align: 'right',
    sortValue: (r) => r.photos,
    render: (r) => {
      if (r.photos === 0) return <span className="text-ink2">—</span>;
      if (r.photosPicked > 0) {
        const inFilm = r.web === 'ready' || r.ios === 'ready';
        const what = inFilm ? 'in film' : 'picked';
        return (
          <span
            title={`${r.photosPicked} of ${r.photos} photos ${inFilm ? 'are in the film' : 'were picked by the plan'}`}
          >
            <div>
              {r.photosPicked} {what}
            </div>
            <div className="text-ink2 text-xs">of {r.photos}</div>
          </span>
        );
      }
      return (
        <span
          className={r.photosTagged === r.photos ? 'text-ink2' : 'text-amber-500'}
          title={`${r.photosTagged} of ${r.photos} tagged`}
        >
          {r.photosTagged} / {r.photos} tagged
        </span>
      );
    },
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
