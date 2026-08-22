'use client';

import { type AdminColumn, AdminTable } from '@/app/admin/_components/AdminTable';
import Link from 'next/link';

export type CommunityNearbyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** `community_tour_runs.status` of the newest run; null = never run. */
  stage: string | null;
  runCount: number;
  poiCount: number;
  poiApproved: number;
  videosReady: number;
  videosFailed: number;
  lastActivityAt: string | null;
  /** Formatted on the server — see the note at the call site. */
  lastActivityLabel: string;
};

/**
 * The pipeline's own status values, in the order they happen, with the label
 * and tone the index shows.
 *
 * `review` is amber because it is the only stage waiting on the owner: the
 * photo gate stops the run until he approves or rejects, so a table of green
 * "assembled" rows with one amber "review" row is a to-do list.
 */
const STAGES: Record<string, { label: string; rank: number; tone: string }> = {
  researching: { label: 'Research', rank: 1, tone: 'text-ink2' },
  resolving: { label: 'Resolve', rank: 2, tone: 'text-ink2' },
  fetching_photos: { label: 'Photos', rank: 3, tone: 'text-blue-500' },
  tagging: { label: 'Tagging', rank: 4, tone: 'text-blue-500' },
  review: { label: 'Review', rank: 5, tone: 'text-amber-500' },
  generating: { label: 'Rendering', rank: 6, tone: 'text-blue-500' },
  assembled: { label: 'Assembled', rank: 7, tone: 'text-emerald-500' },
  failed: { label: 'Failed', rank: 8, tone: 'text-red-500' },
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
    // Sorted by how far through the pipeline the run got, not alphabetically:
    // "assembled" before "failed" before "generating" tells you nothing.
    // Never-run rows sort last, which is where 8.6k of them belong.
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
    key: 'pois',
    header: 'POIs',
    align: 'right',
    sortValue: (r) => r.poiCount,
    render: (r) =>
      r.poiCount === 0 ? (
        <span className="text-ink2">—</span>
      ) : (
        <>
          <span className="text-emerald-500">{r.poiApproved}</span>
          <span className="text-ink2"> / {r.poiCount}</span>
        </>
      ),
  },
  {
    // Finished films, from `tour_assemblies` — the thing the whole pipeline is
    // for. This used to count `generated_videos` (the bucket-video pipeline),
    // which is why every row read 0/0.
    key: 'videos',
    header: 'Videos',
    align: 'right',
    sortValue: (r) => r.videosReady * 1000 + r.videosFailed,
    render: (r) =>
      r.videosReady === 0 && r.videosFailed === 0 ? (
        <span className="text-ink2">—</span>
      ) : (
        <>
          <span className="text-emerald-500">{r.videosReady}</span>
          {r.videosFailed > 0 && <span className="text-red-500"> +{r.videosFailed} failed</span>}
        </>
      ),
  },
  {
    // The page hands rows down newest-touched-first, where "touched" means the
    // pipeline OR the community record; without a time on screen that order
    // reads as random.
    key: 'activity',
    header: 'Last activity',
    align: 'right',
    sortValue: (r) => r.lastActivityAt ?? '',
    render: (r) => <span className="text-ink2">{r.lastActivityLabel}</span>,
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
      // Search the whole table, not the page's 500-row window: there are ~8.7k
      // communities and the window stops partway through the B's.
      serverSearchParam="q"
      emptyMessage="No communities found."
      searchPlaceholder="Search all communities…"
      minWidth={860}
    />
  );
}
