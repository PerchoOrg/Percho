/**
 * Home Tour activity, folded per listing for the /admin/pipeline/tour-jobs
 * index. The counterpart of `lib/communities/tour-index.ts`, one pipeline over.
 *
 * The index used to order by `listings.created_at` and show a photo count, a
 * video count and a one-word Tour status read off `listing_videos` — one row
 * per home, so it could not say that the web cut is up and the iOS one is
 * still encoding. Nothing on the row said how far through the pipeline a home
 * had got, and a home rendered five minutes ago sat wherever it was first
 * created (owner 2026-08-22, after the same complaint about the community
 * index: give the table more, and put what was processed most recently first).
 *
 * `listing_tour_runs` is the pipeline's own clock — every step writes its
 * result back through `saveListingStep`, which stamps the run. Verified
 * against production 2026-08-22: all 15 listings holding a film and all 87
 * assemblies trace to a run, so nothing finished is left without a timestamp.
 *
 * Unlike the community index, a plain edit to the record is NOT activity here.
 * `communities.updated_at` moves when the owner edits a community; 247 of the
 * 265 listings share one `listings.updated_at` from a bulk backfill, so
 * folding it in would order the table by an import job rather than by the
 * pipeline. Homes the pipeline has never touched fall to the back in creation
 * order, which is where the old index put everything.
 *
 * 2026-08-23: the Stage column showed the NEWEST run's status, which a dead
 * run hijacks — 5122 Lower Creek Street read "Plan" while holding two finished
 * cuts, because a re-run started 18:03 and stopped after planning (owner: "why
 * do we have 5 runs?"). Stage is the FURTHEST any run got; an unfinished newer
 * attempt is a note beside it, not a replacement for it.
 *
 * Pure — no Supabase import — so the page can be tested without a database.
 */

export type SurfaceState = 'ready' | 'pending' | 'failed';

export type IndexListing = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  created_at: string;
  agents: { name: string } | null;
};

export type IndexPhoto = {
  listing_id: string;
  tagged_at: string | null;
  /** Stamped by the PLAN step on every photo it picked — see `photosPicked`. */
  used_in_video_at: string | null;
};

export type IndexRun = {
  listing_id: string;
  /** `listing_tour_runs.status`: tagging → review → planning → … → ready. */
  status: string;
  updated_at: string | null;
};

export type IndexAssembly = {
  listing_id: string;
  /** 'web' or 'ios' — the film exists once per surface. */
  surface: string;
  status: string;
  updated_at: string | null;
};

/**
 * How far each `listing_tour_runs.status` is through the pipeline. `failed` is
 * not a rung on that ladder — a failed attempt must never outrank a finished
 * one when picking the run a row is judged by — so it sits below the first.
 */
export const PROGRESS_RANK: Record<string, number> = {
  failed: 0,
  tagging: 1,
  review: 2,
  planning: 3,
  generating: 4,
  assembling: 5,
  ready: 6,
};

export type TourJobRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  agentName: string | null;
  /** Status of the FURTHEST run — the pipeline's own stage name. Null = never run. */
  stage: string | null;
  /**
   * The newest run's status when that run is not the furthest one: an attempt
   * started after the home already got further, and still unfinished.
   */
  rerunStage: string | null;
  runCount: number;
  photos: number;
  photosTagged: number;
  /**
   * Photos the plan picked; it drops the rest (5122 Lower Creek Street: 75
   * photos, 20 picked). Once a cut exists this is also what is IN it —
   * assembly uses exactly the planned shots, which held for all 15 listings
   * with a film on 2026-08-23 — but the plan stamps it, so on its own it does
   * NOT mean a film exists. 3855 Oak Park Drive has 9 picked and no cut.
   */
  photosPicked: number;
  /** Newest cut per surface. Null = that surface has never been assembled. */
  web: SurfaceState | null;
  ios: SurfaceState | null;
  /** Newest run-or-assembly timestamp; null when the pipeline never ran. */
  lastActivityAt: string | null;
  /** Formatted on the server — see the note at the call site. */
  lastActivityLabel: string;
};

/**
 * Timestamps arrive from three tables that format them differently —
 * `…:49.632+00:00` from one, `…:27.161740+00:00` from another — so a string
 * compare ranks by fractional-digit count ('+' sorts before '0'). Parse.
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

function surfaceState(status: string): SurfaceState {
  if (status === 'ready' || status === 'approved') return 'ready';
  if (status === 'failed') return 'failed';
  return 'pending';
}

type Activity = {
  runCount: number;
  /** The furthest run: highest progress rank, newest among equals. */
  best: IndexRun | null;
  /** The most recently touched run, whether or not it got anywhere. */
  newest: IndexRun | null;
  web: IndexAssembly | null;
  ios: IndexAssembly | null;
  lastActivityAt: string | null;
};

function empty(): Activity {
  return {
    runCount: 0,
    best: null,
    newest: null,
    web: null,
    ios: null,
    lastActivityAt: null,
  };
}

function progress(run: IndexRun): number {
  return PROGRESS_RANK[run.status] ?? 0;
}

/**
 * Fold the pipeline's rows into one record per listing.
 *
 * The stage is the FURTHEST run's status, not the newest run's: a re-run that
 * stops after planning would otherwise hide a home's finished film behind
 * "Plan" forever. The newest run is kept alongside it so an unfinished newer
 * attempt can be shown as what it is. The two cuts follow the same rule as
 * before — a surface re-rendered after a failure must show the re-render.
 */
export function foldTourActivity(input: {
  runs: IndexRun[];
  assemblies: IndexAssembly[];
}): Map<string, Activity> {
  const out = new Map<string, Activity>();
  const at = (id: string): Activity => {
    const cur = out.get(id) ?? empty();
    out.set(id, cur);
    return cur;
  };

  for (const r of input.runs) {
    const a = at(r.listing_id);
    a.runCount += 1;
    a.lastActivityAt = newer(a.lastActivityAt, r.updated_at);
    const ts = millis(r.updated_at);
    // Newest among equal ranks, so a home re-run to the same stage reports the
    // attempt that is actually current rather than the first one ever made.
    if (
      !a.best ||
      progress(r) > progress(a.best) ||
      (progress(r) === progress(a.best) && ts >= millis(a.best.updated_at))
    ) {
      a.best = r;
    }
    if (!a.newest || ts >= millis(a.newest.updated_at)) a.newest = r;
  }

  for (const asm of input.assemblies) {
    const a = at(asm.listing_id);
    a.lastActivityAt = newer(a.lastActivityAt, asm.updated_at);
    if (asm.surface !== 'web' && asm.surface !== 'ios') continue;
    const seen = a[asm.surface];
    if (!seen || millis(asm.updated_at) >= millis(seen.updated_at)) a[asm.surface] = asm;
  }

  return out;
}

export function buildTourIndexRows(input: {
  listings: IndexListing[];
  photos: IndexPhoto[];
  runs: IndexRun[];
  assemblies: IndexAssembly[];
  /** Renders the relative "3h ago" label; the page passes `formatAge`. */
  formatActivity: (iso: string | null) => string;
}): TourJobRow[] {
  const photos = new Map<string, { total: number; tagged: number; picked: number }>();
  for (const p of input.photos) {
    const s = photos.get(p.listing_id) ?? { total: 0, tagged: 0, picked: 0 };
    s.total += 1;
    if (p.tagged_at) s.tagged += 1;
    if (p.used_in_video_at) s.picked += 1;
    photos.set(p.listing_id, s);
  }

  const activity = foldTourActivity({ runs: input.runs, assemblies: input.assemblies });

  const rows = input.listings.map((l) => {
    const p = photos.get(l.id) ?? { total: 0, tagged: 0, picked: 0 };
    const a = activity.get(l.id);
    // Only when the newer attempt has NOT got as far: two runs that both
    // reached the same stage are one story, not a stalled re-run.
    const rerun = a?.newest && a.newest !== a.best ? a.newest.status : null;
    return {
      row: {
        id: l.id,
        address: l.address,
        city: l.city,
        state: l.state,
        status: l.status,
        agentName: l.agents?.name ?? null,
        stage: a?.best?.status ?? null,
        rerunStage: rerun,
        runCount: a?.runCount ?? 0,
        photos: p.total,
        photosTagged: p.tagged,
        photosPicked: p.picked,
        web: a?.web ? surfaceState(a.web.status) : null,
        ios: a?.ios ? surfaceState(a.ios.status) : null,
        lastActivityAt: a?.lastActivityAt ?? null,
        lastActivityLabel: input.formatActivity(a?.lastActivityAt ?? null),
      },
      createdAt: l.created_at,
    };
  });

  rows.sort((x, y) => {
    const ax = millis(x.row.lastActivityAt);
    const ay = millis(y.row.lastActivityAt);
    // Compared before subtracting: an untouched home is −∞, and −∞ − −∞ is NaN,
    // which a comparator reads as "equal" only by accident.
    if (ax !== ay) return ay - ax;
    // Both untouched: newest home first, the order the index had before the
    // pipeline had a say.
    return millis(y.createdAt) - millis(x.createdAt);
  });

  return rows.map((r) => r.row);
}
