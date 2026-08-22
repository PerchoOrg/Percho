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

export type IndexPhoto = { listing_id: string; tagged_at: string | null };

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

export type TourJobRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  agentName: string | null;
  /** Status of the newest run — the pipeline's own stage name. Null = never run. */
  stage: string | null;
  runCount: number;
  photos: number;
  photosTagged: number;
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
  stage: string | null;
  stageAt: number;
  web: IndexAssembly | null;
  ios: IndexAssembly | null;
  lastActivityAt: string | null;
};

function empty(): Activity {
  return {
    runCount: 0,
    stage: null,
    stageAt: Number.NEGATIVE_INFINITY,
    web: null,
    ios: null,
    lastActivityAt: null,
  };
}

/**
 * Fold the pipeline's rows into one record per listing.
 *
 * The stage is the NEWEST run's status, not the last row the query returned:
 * a home is re-run, and an older run's row can sort ahead once `updated_at` is
 * touched out of order. Same for the two cuts — a surface re-rendered after a
 * failure must show the re-render.
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
    if (a.stage === null || ts >= a.stageAt) {
      a.stage = r.status;
      a.stageAt = ts;
    }
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
  const photos = new Map<string, { total: number; tagged: number }>();
  for (const p of input.photos) {
    const s = photos.get(p.listing_id) ?? { total: 0, tagged: 0 };
    s.total += 1;
    if (p.tagged_at) s.tagged += 1;
    photos.set(p.listing_id, s);
  }

  const activity = foldTourActivity({ runs: input.runs, assemblies: input.assemblies });

  const rows = input.listings.map((l) => {
    const p = photos.get(l.id) ?? { total: 0, tagged: 0 };
    const a = activity.get(l.id);
    return {
      row: {
        id: l.id,
        address: l.address,
        city: l.city,
        state: l.state,
        status: l.status,
        agentName: l.agents?.name ?? null,
        stage: a?.stage ?? null,
        runCount: a?.runCount ?? 0,
        photos: p.total,
        photosTagged: p.tagged,
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
