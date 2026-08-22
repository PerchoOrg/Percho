/**
 * Community Tour activity, folded per community for the
 * /admin/pipeline/community-nearby index.
 *
 * 2026-08-22: the index's "Videos" column counted `generated_videos` rows with
 * scope='community_intent_bucket' — the bucket-video pipeline, which has 8
 * rows in the whole database and nothing to do with the Community Tour. Every
 * row therefore read 0/0, including the communities with a finished film
 * (owner: "why all rows show 0/0 video"). The tour lives in
 * `community_tour_runs` / `tour_assemblies` / `community_pois`; this folds
 * those three into the numbers the index shows.
 *
 * Pure — no Supabase import — so the page can be tested without a database.
 */

export type TourRunRow = {
  community_id: string;
  /** `community_tour_runs.status`: researching → … → review → … → assembled. */
  status: string;
  updated_at: string | null;
};

export type TourAssemblyRow = {
  community_id: string;
  status: string;
  updated_at: string | null;
};

export type TourPoiRow = {
  community_id: string;
  status: string;
};

export type TourActivity = {
  runCount: number;
  /** Status of the most recently touched run — the pipeline's own stage name. */
  stage: string | null;
  poiCount: number;
  poiApproved: number;
  videosReady: number;
  videosFailed: number;
  /** Newest run-or-assembly timestamp; null when neither carries one. */
  lastActivityAt: string | null;
};

function empty(): TourActivity {
  return {
    runCount: 0,
    stage: null,
    poiCount: 0,
    poiApproved: 0,
    videosReady: 0,
    videosFailed: 0,
    lastActivityAt: null,
  };
}

/**
 * Timestamps land here from two tables that format them differently —
 * `…:52.398+00:00` from one, `…:03.248644+00:00` from the other — so a string
 * compare would rank by fractional-digit count. Parse instead.
 */
function millis(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function newer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return millis(a) >= millis(b) ? a : b;
}

export function foldTourActivity(input: {
  runs: TourRunRow[];
  assemblies: TourAssemblyRow[];
  pois: TourPoiRow[];
}): Map<string, TourActivity> {
  const out = new Map<string, TourActivity>();
  const at = (id: string): TourActivity => {
    const cur = out.get(id) ?? empty();
    out.set(id, cur);
    return cur;
  };

  // The stage is the newest run's status, not the newest row the query
  // happened to return: a community is re-run, and an older run's row can sort
  // ahead once `updated_at` is touched out of order.
  const stageAt = new Map<string, number>();
  for (const r of input.runs) {
    const a = at(r.community_id);
    a.runCount += 1;
    a.lastActivityAt = newer(a.lastActivityAt, r.updated_at);
    const ts = millis(r.updated_at);
    if (a.stage === null || ts >= (stageAt.get(r.community_id) ?? Number.NEGATIVE_INFINITY)) {
      a.stage = r.status;
      stageAt.set(r.community_id, ts);
    }
  }

  for (const asm of input.assemblies) {
    const a = at(asm.community_id);
    a.lastActivityAt = newer(a.lastActivityAt, asm.updated_at);
    if (asm.status === 'ready') a.videosReady += 1;
    else if (asm.status === 'failed') a.videosFailed += 1;
  }

  for (const p of input.pois) {
    const a = at(p.community_id);
    a.poiCount += 1;
    if (p.status === 'approved') a.poiApproved += 1;
  }

  return out;
}

/**
 * Newest-touched first, where "touched" is the tour pipeline OR a plain edit
 * to the community record. Both are reasons the owner goes looking for a row,
 * and neither is expressible as a single `order by` across two tables.
 */
export function sortByLastActivity<T extends { lastActivityAt: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => millis(b.lastActivityAt) - millis(a.lastActivityAt));
}

/**
 * The later of two timestamps, either of which may be null. Exported because
 * the index merges pipeline activity with `communities.updated_at`, which
 * arrives from a third table in a fourth format.
 */
export function newerTimestamp(a: string | null, b: string | null): string | null {
  return newer(a, b);
}
