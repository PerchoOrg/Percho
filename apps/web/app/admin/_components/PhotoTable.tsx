'use client';

/**
 * PhotoTable — one row per photo, every decision-relevant field in a column.
 *
 * Replaces the thumbnail grid on both admin photo surfaces. Owner 2026-08-03:
 * "把 photos 做成一个表格的形式 每一行一个 photo，显示重要的信息以及管理按键".
 *
 * ONE component for `listing_photos` and `poi_photos`: the columns that differ
 * are the ones the other table has no data for, so they render "—" rather than
 * justifying a second component. `lib/poi/photo-tag-view.ts` absorbs the fact
 * that the two taggers write different keys into `ai_tags`.
 *
 * Client-side sort + filter. The page loads at most a few hundred rows per
 * listing/POI, so paginating or pushing sort to PostgREST would be more moving
 * parts for no gain.
 * ponytail: in-memory sort/filter, revisit if a single owner ever exceeds ~1k photos.
 */

import { discardClip, discardListingClip } from '@/lib/poi/admin-clip-actions';
import {
  type EnhanceDecision,
  type PhotoTable as PhotoTableName,
  queuePhotoEnhancement,
  setEnhancedDecision,
} from '@/lib/poi/admin-enhance-actions';
import { rejectOutpaint, requeueOutpaint } from '@/lib/poi/admin-outpaint-actions';
import {
  setGlobalPhotoStatus,
  setListingPhotoHero,
  setListingPhotoReview,
} from '@/lib/poi/admin-photo-actions';
import { projectTags, resolutionWarning } from '@/lib/poi/photo-tag-view';
import { Check, Film, Sparkles, Star, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** One photo_clips row as the clips route projects it. */
export interface ClipStatus {
  engine: string;
  duration_s: number | null;
  status: string;
  video_url: string | null;
  cost_usd: number | null;
  error: string | null;
}

/** One engine's clip on each canvas. Listing surface only. */
export interface SurfaceClips {
  ios: ClipStatus | null;
  web: ClipStatus | null;
}

/** Narrow the union without a cast — a pair has no `status` of its own. */
function isSurfacePair(v: ClipStatus | SurfaceClips | null | undefined): v is SurfaceClips {
  return !!v && !('status' in v);
}

export interface PhotoRow {
  id: string;
  storage_path: string;
  // listing_photos only
  sort_order?: number | null;
  width?: number | null;
  height?: number | null;
  used_in_video_at?: string | null;
  used_clip_index?: number | null;
  /** listing_photos: the home-tour review verdict. A SEPARATE column from
   *  `status`, which on this table means the upload succeeded. */
  review_status?: string | null;
  /** listing_photos: the owner's manual opening shot. At most one row per
   *  listing has it. Takes effect at the next Plan. */
  hero_pick?: boolean | null;
  // poi_photos only
  width_px?: number | null;
  height_px?: number | null;
  status?: string | null;
  /** Why it is out. Written by the photos step or the review click. */
  rejection_reason?: string | null;
  applicable_buckets?: string[] | null;
  poi_name?: string | null;
  /** poi_photos: the owning POI, so the row can link to its detail page. */
  poi_id?: string | null;
  /** Where the file came from: 'google_places' | 'google_streetview' |
   *  'community_site'. Hand-picked site photos outrank Places ones in the
   *  shot list and are exempt from the per-POI cap, so which is which is
   *  worth seeing (owner 2026-08-19). */
  source?: string | null;
  /** Google TOS attribution, or — for community_site — the page it came from. */
  attribution?: Record<string, unknown> | null;
  // both
  ai_tags?: Record<string, unknown> | null;
  ai_score?: number | null;
  tagged_at?: string | null;
  enhanced_path?: string | null;
  enhanced_status?: string | null;
  /** 9:16 reframing — 'skipped' means the original was already well framed. */
  outpaint_status?: string | null;
  outpainted_path?: string | null;
  outpaint_meta?: {
    width?: number;
    height?: number;
    crop_loss_before?: number;
    model?: string;
    reason?: string;
  } | null;
  outpaint_error?: string | null;
  enhanced_preset?: string | null;
  enhanced_error?: string | null;
  /** Per-photo record of which ops actually fired (worker writes it). Lets you
   *  see WHY a photo changed without diffing pixels. */
  enhanced_meta?: {
    chain?: string;
    straighten_deg?: number | null;
    exposure_gain?: number;
    indoor?: boolean;
    sr?: string | null;
  } | null;
  /** Videos that used this photo (POI: resolved from generated_videos). */
  used_in?: string[];
  /** Community tour: agent-recommended (survived resolve firewall). */
  recommended?: boolean;
  /** Community tour: resolve-step agent agreement (1 or 2 agents). */
  agreement?: number | null;
  /**
   * The Seedance clip.
   *
   * A single `ClipStatus` on the community side, which has one canvas. On the
   * listing side it is a `SurfaceClips` pair — a home tour ships iOS and web
   * and both belong on the SAME ROW (owner 2026-08-21: "can you put it in the
   * same row with ios? it is taking a lot of space"), so the column count
   * stays at three however many canvases there are.
   */
  clip?: ClipStatus | SurfaceClips | null;
  /** The DepthFlow clip (engine=depthflow). */
  depthflow_clip?: ClipStatus | SurfaceClips | null;
  /** The Ken Burns clip (engine=kenburns). */
  kenburns_clip?: ClipStatus | SurfaceClips | null;
}

type SortKey = 'order' | 'score' | 'hero' | 'category' | 'enhanced';
type Filter =
  | 'all'
  | 'untagged'
  | 'unreviewed'
  | 'enhance_ready'
  | 'in_video'
  | 'not_in_video'
  | 'missing_clip';

/**
 * Optional per-row picker. REMOVED with the Generate AI Video panel
 * (2026-08-17) — no caller passes selection anymore.
 */

/** One clip as the orchestrator planned it, keyed by photo_id. */
export interface PlanCell {
  sort_order: number;
  engine: string;
  move: string;
  duration_s: number;
  ai_generated: boolean;
  /** Seedance only: the exact prompt the clip will be generated from. */
  prompt: string | null;
}

export function PhotoTable({
  table,
  storageBase,
  bucket,
  photos,
  onGenerateClip,
  plan,
  dropReasons,
}: {
  table: PhotoTableName;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
  /** Community tour: per-row "Generate seedance clip" button (photo_clips).
      `engine` forces the clip engine (DA+KB column passes 'kenburns'). */
  onGenerateClip?: (
    photoId: string,
    engine?: string,
    surface?: 'ios' | 'web',
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Community tour: the planned shot per photo (step_results.photos.shots).
      Without it the Plan column reads "—". Engine is decided by the
      orchestrator at plan time and nothing in this table may guess at it. */
  plan?: Record<string, PlanCell>;
  /** Community tour, Dropped table: why each photo is out, by photo_id. The
      column replaces Plan — a dropped photo has no plan to show. */
  dropReasons?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('score');
  const [filter, setFilter] = useState<Filter>('all');
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [clipLightbox, setClipLightbox] = useState<string | null>(null);
  /**
   * Review verdicts applied locally, so approving does not move the row.
   *
   * `router.refresh()` re-runs the server component, which re-sorts and
   * re-groups — an approved photo jumps out of Other and into Approved,
   * usually off-screen, and the next photo is no longer under the cursor.
   * Reviewing a hundred photos that way means hunting for your place after
   * every click (owner 2026-08-20: "dont redirect me, i want to go to the next
   * photo").
   *
   * The verdict drives both what the row shows AND which section it sits in,
   * so a rejected photo leaves Pending immediately — but locally, with no
   * server round-trip and no navigation, so the page does not move under you.
   */
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});

  /**
   * The manual hero, applied locally so the click lands instantly.
   *
   * `undefined` = no local override, use whatever the server row says.
   * `null` = cleared by hand. A string = that photo id. One value rather than
   * a map because a listing has exactly one hero — the partial unique index on
   * `listing_photos (listing_id) where hero_pick` makes two an impossible
   * state, and a map would let this component render one anyway.
   */
  const [heroLocal, setHeroLocal] = useState<string | null | undefined>(undefined);
  /**
   * Non-error feedback. Picking a hero changes NOTHING on screen until Plan
   * runs again — the Plan column still shows the old opening shot — so a click
   * that says nothing looks like a click that did nothing.
   */
  const [notice, setNotice] = useState<string | null>(null);

  const isListing = table === 'listing_photos';
  const url = (p: string) => `${storageBase}/storage/v1/object/public/${bucket}/${p}`;

  /**
   * Where each table keeps its review verdict.
   *
   * `poi_photos.status` IS the verdict. `listing_photos.status` is the upload's
   * state ('ready' | 'error') and has been since the baseline, so the home tour
   * got its own `review_status` column rather than overloading it — reading
   * `p.status` here would grade every listing photo as neither approved nor
   * rejected but "ready", and drop the whole table into one section.
   */
  const verdictOf = useCallback(
    (p: PhotoRow) => (isListing ? p.review_status : p.status) ?? 'pending',
    [isListing],
  );

  /**
   * Which photos may be sent to Seedance.
   *
   * `null` means no restriction — that is the community tour, where every POI
   * photo is a candidate for AI generation.
   *
   * On a HOME tour it is the opening and closing shot and nothing else (owner
   * 2026-08-20: "i may need seedback for the first picture or last one, as
   * hero photo"). Seedance generates video OF THE HOUSE, so the narrower the
   * exposure the better; a hero bookend is the whole of the ask.
   *
   * Derived from the plan rather than from `sort_order`, because the cut's
   * first shot is the planner's choice, not the upload order's. No plan yet
   * means no hero yet, which is an empty set — the button is off until Plan
   * has run, and the tooltip says why.
   */
  const seedanceAllowed = useMemo(() => {
    if (!isListing) return null;
    const ordered = Object.entries(plan ?? {}).sort((a, b) => a[1].sort_order - b[1].sort_order);
    const ends = [ordered[0]?.[0], ordered[ordered.length - 1]?.[0]].filter(
      (v): v is string => !!v,
    );
    return new Set(ends);
  }, [isListing, plan]);

  /**
   * The effective hero: the local pick when there is one, else the stored row.
   *
   * Note it is NOT read from the plan. The plan's opening shot is what the
   * LAST plan decided; `hero_pick` is what the next one will be told to do,
   * and between the click and the re-plan those two disagree on purpose.
   */
  const heroId = useMemo(
    () => (heroLocal === undefined ? (photos.find((p) => p.hero_pick)?.id ?? null) : heroLocal),
    [heroLocal, photos],
  );

  /**
   * How many columns the header actually renders. Kept next to the header so
   * the two move together — a section row's colSpan has to match exactly, and
   * guessing high does not degrade gracefully (see the header row below).
   */
  const columnCount =
    3 + // Photo, Enhanced, then # / POI
    1 + // Review
    3 + // Clip, DA, KB
    (isListing ? 0 : 1) + // Reframed
    (isListing ? 0 : 1) + // Source
    2 + // Size, Category
    1 + // Plan
    1 + // Score
    (isListing ? 1 : 0) + // Hero
    (isListing ? 0 : 1) + // Buckets
    (isListing ? 1 : 0) + // In video (listing surface only)
    2; // AI description, AI tags

  const rows = useMemo(() => {
    const withTags = photos.map((p) => ({
      p,
      t: projectTags(p.ai_tags),
      w: p.width ?? p.width_px ?? null,
      h: p.height ?? p.height_px ?? null,
      inVideo: !!p.used_in_video_at || (p.used_in?.length ?? 0) > 0,
    }));

    const filtered = withTags.filter(({ p, t, inVideo }) => {
      switch (filter) {
        case 'untagged':
          return !p.tagged_at;
        case 'unreviewed':
          return verdictOf(p) === 'pending';
        case 'enhance_ready':
          return p.enhanced_status === 'ready';
        case 'in_video':
          return inVideo;
        case 'not_in_video':
          return !inVideo && (t.usable ?? true);
        case 'missing_clip':
          // In the cut, but at least one canvas has no ready clip. Ten rows is
          // enough for "which one is missing" to be a real search (owner
          // 2026-08-21), and it only gets worse with more photos.
          return !!plan?.[p.id] && missingSurfaces(p).length > 0;
        default:
          return true;
      }
    });

    const by = {
      // nullsLast for every numeric sort: an untagged photo has no score and
      // must not outrank a scored one just because null sorts high.
      score: (a: (typeof withTags)[number], b: (typeof withTags)[number]) =>
        (b.p.ai_score ?? -1) - (a.p.ai_score ?? -1),
      hero: (a: (typeof withTags)[number], b: (typeof withTags)[number]) =>
        (b.t.heroScore ?? -1) - (a.t.heroScore ?? -1),
      order: (a: (typeof withTags)[number], b: (typeof withTags)[number]) =>
        (a.p.sort_order ?? 0) - (b.p.sort_order ?? 0),
      category: (a: (typeof withTags)[number], b: (typeof withTags)[number]) =>
        (a.t.category ?? 'zzz').localeCompare(b.t.category ?? 'zzz'),
      enhanced: (a: (typeof withTags)[number], b: (typeof withTags)[number]) =>
        (a.p.enhanced_status ?? '').localeCompare(b.p.enhanced_status ?? ''),
    }[sort];

    return [...filtered].sort(by);
  }, [photos, sort, filter, verdictOf, plan]);

  /**
   * The table is grouped by review verdict: Approved, Rejected, then Pending.
   *
   * Owner 2026-08-19. This is the shape of the review itself — he goes through
   * the approved AND the rejected — and interleaving them by score meant
   * scanning the whole table twice to do either. "Other" is everything not yet
   * decided, which is the working pile.
   *
   * A flat list with header entries rather than three tables: one `<table>`
   * keeps the columns aligned across the sections, which is the entire reason
   * to group them side by side instead of stacking three separate grids.
   */
  const items = useMemo(() => {
    type Row = (typeof rows)[number];
    const approved: Row[] = [];
    const rejected: Row[] = [];
    const other: Row[] = [];
    for (const r of rows) {
      // The LOCAL verdict decides the section, so a photo you just rejected
      // leaves Pending on the click rather than on the next page load (owner
      // 2026-08-20: "i see some rejected photos in the pending section, they
      // should go to rejected area directly"). No refresh is involved, so the
      // scroll position holds and the next photo slides up under the cursor.
      const st = verdicts[r.p.id] ?? verdictOf(r.p);
      if (st === 'approved') approved.push(r);
      else if (st === 'rejected') rejected.push(r);
      else other.push(r);
    }
    const out: Array<{ header: string; count: number } | Row> = [];
    for (const [label, group] of [
      ['Approved Photos', approved],
      ['Rejected Photos', rejected],
      // "Pending", not "Other": the section IS the pending pile — `plan` demotes
      // every approved photo it did not pick back to 'pending', so the word is
      // the row's own status rather than a leftovers bin (owner 2026-08-23).
      ['Pending Photos', other],
    ] as const) {
      if (group.length === 0) continue;
      out.push({ header: label, count: group.length });
      out.push(...group);
    }
    return out;
  }, [rows, verdicts, verdictOf]);

  /** Review verdict: optimistic, no refresh, row keeps its place. */
  function decide(id: string, decision: 'approved' | 'rejected') {
    const previous = verdicts[id];
    setVerdicts((v) => ({ ...v, [id]: decision }));
    setError(null);
    void (async () => {
      const res = isListing
        ? await setListingPhotoReview(id, decision)
        : await setGlobalPhotoStatus(id, decision);
      if (!res.ok) {
        // Put it back: a verdict that did not persist must not look like it did.
        setVerdicts((v) => {
          const next = { ...v };
          if (previous) next[id] = previous;
          else delete next[id];
          return next;
        });
        setError(res.message ?? 'Failed');
      }
    })();
  }

  /** Manual hero: optimistic, no refresh, and it only binds at the next Plan. */
  function pickHero(id: string, on: boolean) {
    const previous = heroLocal;
    setHeroLocal(on ? id : null);
    setError(null);
    // The Seedance clause is not a detail. The hero is the one shot that
    // bills, so moving it means the next Render pays for a generation of the
    // new opening shot — said before the click is spent, not after.
    setNotice(
      on
        ? 'Hero set — run Plan to rebuild the shot list around it, then Render. The new opening shot is the one Seedance generates, so that Render bills one clip. The old hero keeps its clip in case you switch back.'
        : 'Hero cleared — run Plan to let the planner choose the opening shot again.',
    );
    void (async () => {
      const res = await setListingPhotoHero(id, on);
      if (!res.ok) {
        setHeroLocal(previous);
        setNotice(null);
        setError(res.message ?? 'Failed');
      }
    })();
  }

  function run(id: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setPending(id);
    setError(null);
    void (async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? 'Failed');
      setPending(null);
      router.refresh();
    })();
  }

  // Auto-enhance (owner 2026-08-17): no per-photo manual action. Photos that
  // still need enhancement (none/failed) get queued; photos the worker already
  // finished (ready) get auto-approved so thumbnails + clips use the enhanced
  // file. Fires on mount + whenever the photo set changes (re-fetch, tag).
  const [enhancedRefreshing, setEnhancedRefreshing] = useState(false);
  useEffect(() => {
    const needsEnhance = photos.filter(
      (p) => p.enhanced_status === 'none' || p.enhanced_status === 'failed',
    );
    const autoApprove = photos.filter((p) => p.enhanced_status === 'ready' && p.enhanced_path);
    if (needsEnhance.length === 0 && autoApprove.length === 0) return;
    setEnhancedRefreshing(true);
    void (async () => {
      for (const p of needsEnhance) {
        await queuePhotoEnhancement(table, [p.id]);
      }
      for (const p of autoApprove) {
        await setEnhancedDecision(table, p.id, 'approved');
      }
      setEnhancedRefreshing(false);
      router.refresh();
    })();
  }, [photos, table, router]);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink2">
        No photos yet.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-xl">
          All Photos{' '}
          <span className="font-normal text-base text-ink2 tabular-nums">
            ({rows.length}/{photos.length})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter photos"
            className="rounded-lg border border-line bg-bg px-2 py-1.5"
          >
            <option value="all">All</option>
            <option value="untagged">Not AI-tagged</option>
            <option value="unreviewed">Awaiting review</option>
            <option value="enhance_ready">Enhanced, awaiting approval</option>
            <option value="in_video">In a video</option>
            <option value="not_in_video">Usable but unused</option>
            <option value="missing_clip">Planned, missing a clip</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort photos"
            className="rounded-lg border border-line bg-bg px-2 py-1.5"
          >
            <option value="score">Sort: AI score</option>
            {isListing && <option value="hero">Sort: hero score</option>}
            {isListing && <option value="order">Sort: photo order</option>}
            <option value="category">Sort: category</option>
            <option value="enhanced">Sort: enhance status</option>
          </select>
          {enhancedRefreshing ? (
            <span className="flex items-center gap-1.5 text-ink2">
              <Sparkles size={13} className="animate-pulse" />
              Enhancing…
            </span>
          ) : (
            <span className="text-ink2">Auto-enhanced</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {notice && !error && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-700 text-xs">{notice}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-surface text-ink2">
            <tr>
              <Th hint="approve / reject">Review</Th>
              <Th hint="as fetched">Photo</Th>
              <Th hint="ESRGAN x2">Enhanced</Th>
              {!isListing && <Th hint="outpainted to 2:3">Reframed</Th>}
              <Th hint={isListing ? 'Seedance, paid — hero shot only' : 'Seedance, paid'}>Clip</Th>
              <Th hint="DepthFlow parallax">DA</Th>
              <Th hint="Ken Burns pan">KB</Th>
              <Th hint={isListing ? 'order' : 'place'}>{isListing ? '#' : 'POI'}</Th>
              {!isListing && <Th hint="where it came from">Source</Th>}
              <Th hint="pixels">Size</Th>
              <Th hint="tagger">Category</Th>
              <Th className="min-w-[110px]" hint="in the cut, or why not">
                Plan
              </Th>
              <Th hint="0-1, tagger">Score</Th>
              {isListing && <Th hint="cover fit">Hero</Th>}
              {!isListing && <Th hint="which tour sections">Buckets</Th>}
              {isListing && <Th hint="used in a render">In video</Th>}
              <Th className="min-w-[160px]" hint="what the tagger saw">
                AI description
              </Th>
              <Th className="min-w-[110px]" hint="tagger keywords">
                AI tags
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if ('header' in item) {
                return (
                  <tr key={`h-${item.header}`} className="bg-ink2/5">
                    {/* The REAL column count. A too-large colSpan (this was 99)
                        makes the browser widen the table to that many columns:
                        every real column is squeezed off-screen, the Clip
                        columns vanish and the thumbnail buttons collapse to
                        nothing (owner 2026-08-19: "Photos can not be clicked
                        and clips are gone"). */}
                    <td colSpan={columnCount} className="px-2 py-1.5">
                      <span className="font-semibold text-ink text-sm">{item.header}</span>{' '}
                      <span className="text-ink2 text-xs tabular-nums">({item.count})</span>
                    </td>
                  </tr>
                );
              }
              const { p, t, w, h, inVideo } = item;
              // The row's effective verdict — local if there is one.
              //
              // Named explicitly rather than left to a bare `status`: that
              // identifier resolves to `window.status` in a DOM lib, so a
              // missing definition type-checks clean and silently reads an
              // empty string at runtime.
              const rowStatus = verdicts[p.id] ?? verdictOf(p);
              const res = resolutionWarning(w, h);
              const busy = pending === p.id || pending === 'bulk';
              const showEnhanced = p.enhanced_status === 'approved' && p.enhanced_path;
              const thumbPath = showEnhanced ? (p.enhanced_path as string) : p.storage_path;
              return (
                <tr key={p.id} className="border-line border-t align-top hover:bg-surface/60">
                  <Td>
                    <div className="flex flex-col gap-1">
                      <>
                        {t.usable === false ? (
                          <span className="text-red-600">rejected</span>
                        ) : (
                          <StatusText value={rowStatus} />
                        )}
                        {/* WHY it is out. A bare "rejected" made an automated
                              verdict indistinguishable from the owner's own
                              click, so the automated ones could not be
                              questioned — and two turned out to be wrong
                              (owner 2026-08-20). */}
                        {rowStatus === 'rejected' && p.rejection_reason && (
                          <span
                            className="block text-[10px] text-red-600/80 leading-tight"
                            title={p.rejection_reason}
                          >
                            {truncate(p.rejection_reason, 48)}
                          </span>
                        )}
                        <div className="flex gap-1">
                          <MiniBtn
                            label={<Check size={11} />}
                            title={
                              isListing
                                ? 'Approve photo — it stays a candidate for this home tour'
                                : 'Approve photo (platform-wide) — the only gate for final video material'
                            }
                            active={rowStatus === 'approved'}
                            onClick={() => decide(p.id, 'approved')}
                          />
                          <MiniBtn
                            label={<X size={11} />}
                            title={
                              isListing
                                ? 'Reject photo — the plan step will leave it out of the cut'
                                : 'Reject photo — removes it from every video pool'
                            }
                            danger
                            active={rowStatus === 'rejected'}
                            onClick={() => decide(p.id, 'rejected')}
                          />
                          {/* Home tour only. The hero is the cut's opening
                              shot and the one shot Seedance animates; the
                              planner picks it well most of the time, and this
                              is the lever for when it does not (owner
                              2026-08-23). A rejected photo cannot be one —
                              the plan step never sees it. */}
                          {isListing && (
                            <MiniBtn
                              label={<Star size={11} />}
                              title={
                                rowStatus === 'rejected'
                                  ? 'A rejected photo cannot open the tour — approve it first'
                                  : heroId === p.id
                                    ? 'This is the hero. Click to hand the choice back to the planner, then run Plan.'
                                    : 'Make this the opening shot — the hero Seedance animates. Takes effect at the next Plan.'
                              }
                              active={heroId === p.id}
                              disabled={rowStatus === 'rejected'}
                              onClick={() => pickHero(p.id, heroId !== p.id)}
                            />
                          )}
                        </div>
                      </>
                    </div>
                  </Td>
                  <Td>
                    {/* The ORIGINAL, always. This used to render `thumbPath`,
                        which is the approved enhanced file when one exists —
                        and since the table auto-approves every enhancement,
                        the Photo and Enhanced columns were showing the same
                        image (owner 2026-08-19: "i dont see big difference
                        between these two"). Two columns comparing a file to
                        itself. */}
                    <Thumb
                      src={url(p.storage_path)}
                      title="The photo as fetched — view full size"
                      onClick={() =>
                        setLightbox({ url: url(p.storage_path), alt: t.description ?? 'photo' })
                      }
                    />
                  </Td>
                  <Td>
                    {/* Picture + one button, no prose. The status word, the
                        op-chain and the error text all had a column of their
                        own worth of noise for something the thumbnail already
                        answers — is it better? (owner 2026-08-19: "remove all
                        the text, just show the button, or pic/video with
                        regenerate"). Failures keep their reason on the title. */}
                    {p.enhanced_path ? (
                      <div className="flex flex-col gap-1">
                        <Thumb
                          src={url(p.enhanced_path as string)}
                          title={
                            p.enhanced_meta?.chain
                              ? `Enhanced: ${p.enhanced_meta.chain}`
                              : 'View the enhanced photo full-size'
                          }
                          onClick={() =>
                            setLightbox({ url: url(p.enhanced_path as string), alt: 'enhanced' })
                          }
                        />
                        <MiniBtn
                          label="Regenerate"
                          title="Enhance this photo again"
                          disabled={busy}
                          onClick={() => run(p.id, () => queuePhotoEnhancement(table, [p.id]))}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {p.enhanced_error && (
                          <span className="text-[10px] text-red-600" title={p.enhanced_error}>
                            failed
                          </span>
                        )}
                        <MiniBtn
                          label={p.enhanced_status === 'queued' ? 'Queued' : 'Enhance'}
                          title="Enhance this photo"
                          disabled={busy || p.enhanced_status === 'queued'}
                          onClick={() => run(p.id, () => queuePhotoEnhancement(table, [p.id]))}
                        />
                      </div>
                    )}
                  </Td>
                  {!isListing && (
                    <Td>
                      <ReframedCell
                        photoId={p.id}
                        status={p.outpaint_status}
                        meta={p.outpaint_meta}
                        error={p.outpaint_error}
                        storageBase={storageBase}
                        bucket={bucket}
                        path={p.outpainted_path}
                        onZoom={(u) => setLightbox({ url: u, alt: 'reframed' })}
                        onChanged={() => router.refresh()}
                      />
                    </Td>
                  )}
                  <Td>
                    <ClipCell
                      clip={isSurfacePair(p.clip) ? p.clip.ios : p.clip}
                      webClip={isSurfacePair(p.clip) ? p.clip.web : undefined}
                      poster={url(thumbPath)}
                      label="Seedance"
                      canGenerate={
                        !!onGenerateClip && (!seedanceAllowed || seedanceAllowed.has(p.id))
                      }
                      disabledHint={
                        seedanceAllowed && !seedanceAllowed.has(p.id)
                          ? seedanceAllowed.size === 0
                            ? "Run Plan first — the hero shot is the plan's first or last."
                            : 'Seedance is the hero shot only (first or last in the cut).'
                          : undefined
                      }
                      busy={busy}
                      onGenerate={() =>
                        onGenerateClip && run(p.id, () => onGenerateClip(p.id, 'seedance'))
                      }
                      onPlay={setClipLightbox}
                      onDiscard={() =>
                        run(p.id, () => (isListing ? discardListingClip(p.id) : discardClip(p.id)))
                      }
                    />
                  </Td>
                  {isListing ? (
                    // One column per CANVAS, not per engine. `pick_engines`
                    // runs per canvas, so the same photo routinely lands on
                    // DepthFlow for iOS and Ken Burns for web — 10 of 21 on the
                    // first real listing. Keyed by engine, those two clips
                    // rendered in DIFFERENT columns and were never beside each
                    // other, which is the opposite of what "same row" meant
                    // (owner 2026-08-21: "still dont see the generated web ones
                    // next to ios"). The engine is not lost — it is in the Plan
                    // column and labelled on the cell.
                    //
                    // Generate sends no engine, so the step uses whatever the
                    // plan chose for that canvas rather than forcing one.
                    (['ios', 'web'] as const).map((surface) => (
                      <Td key={surface}>
                        <ClipCell
                          clip={localClipFor(p, surface)}
                          poster={url(thumbPath)}
                          label={surface === 'ios' ? 'iOS' : 'web'}
                          showEngine
                          canGenerate={!!onGenerateClip}
                          busy={busy}
                          onGenerate={() =>
                            onGenerateClip &&
                            run(p.id, () => onGenerateClip(p.id, undefined, surface))
                          }
                          onPlay={setClipLightbox}
                        />
                      </Td>
                    ))
                  ) : (
                    <>
                      <Td>
                        <ClipCell
                          clip={p.depthflow_clip as ClipStatus | null}
                          poster={url(thumbPath)}
                          label="DepthFlow"
                          canGenerate={!!onGenerateClip}
                          busy={busy}
                          onGenerate={() =>
                            onGenerateClip && run(p.id, () => onGenerateClip(p.id, 'depthflow'))
                          }
                          onPlay={setClipLightbox}
                        />
                      </Td>
                      <Td>
                        <ClipCell
                          clip={p.kenburns_clip as ClipStatus | null}
                          poster={url(thumbPath)}
                          label="Ken Burns"
                          canGenerate={!!onGenerateClip}
                          busy={busy}
                          onGenerate={() =>
                            onGenerateClip && run(p.id, () => onGenerateClip(p.id, 'kenburns'))
                          }
                          onPlay={setClipLightbox}
                        />
                      </Td>
                    </>
                  )}
                  <Td className="tabular-nums text-ink2">
                    {isListing ? (
                      (p.sort_order ?? '—')
                    ) : p.poi_id ? (
                      // The POI tab was dropped 2026-08-03; this is the way in.
                      <a
                        href={`/admin/pipeline/poi-library/${p.poi_id}`}
                        className="text-ink2 underline"
                      >
                        {p.poi_name ?? 'POI'}
                      </a>
                    ) : (
                      (p.poi_name ?? '—')
                    )}
                  </Td>
                  {!isListing && (
                    <Td>
                      <PhotoSourceBadge source={p.source} attribution={p.attribution} />
                    </Td>
                  )}
                  <Td className={res === 'low' ? 'text-amber-600' : 'text-ink2'}>
                    {w && h ? `${w}×${h}` : '—'}
                    {res === 'low' && <div className="text-[10px]">low res</div>}
                  </Td>
                  <Td>
                    {t.category ?? <span className="text-ink2">—</span>}
                    {t.isMaster && <div className="text-[10px] text-ink2">master</div>}
                    {t.usable === false && <div className="text-[10px] text-red-600">unusable</div>}
                  </Td>
                  <Td>
                    {t.usable === false ? (
                      <span className="text-red-600">no</span>
                    ) : plan?.[p.id] ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="tabular-nums text-ink2">
                            #{String(plan[p.id]!.sort_order + 1).padStart(2, '0')}
                          </span>
                          <span
                            className={
                              plan[p.id]!.engine === 'seedance'
                                ? 'font-medium text-emerald-600'
                                : 'font-medium text-ink'
                            }
                          >
                            {plan[p.id]!.engine}
                          </span>
                          {plan[p.id]!.ai_generated && (
                            <span
                              className="rounded bg-emerald-50 px-1 text-[9px] font-medium text-emerald-700"
                              title="AI-generated clip — disclosed on the row in photo_clips"
                            >
                              AI
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-ink2">
                          {plan[p.id]!.move} · {plan[p.id]!.duration_s.toFixed(1)}s
                        </div>
                        {(() => {
                          // A listing row carries two canvases, so say WHICH
                          // one is short rather than a bare "not rendered yet"
                          // — the owner had to hunt ten rows for a shot that
                          // turned out to be mid-render (2026-08-21). The
                          // community tour has one canvas and keeps the
                          // original wording.
                          const short = missingSurfaces(p);
                          if (short.length > 0) {
                            return (
                              <div
                                className="text-[10px] text-amber-600"
                                title="This canvas has no ready clip yet — Render covers both, or use the buttons on this row"
                              >
                                no {short.join(' + ')} clip
                              </div>
                            );
                          }
                          if (isSurfacePair(p.clip) || hasPlannedClip(p, plan[p.id]!.engine)) {
                            return null;
                          }
                          return (
                            <div
                              className="text-[10px] text-amber-600"
                              title="No ready clip for the planned engine — click Generate on this row (or Re-render all DA+KB) to render the plan"
                            >
                              not rendered yet
                            </div>
                          );
                        })()}
                        {plan[p.id]!.prompt && (
                          // The exact string the clip is generated from,
                          // mandatory clauses included. Collapsed so the row
                          // stays readable; this is the text to check before
                          // paying for a generation.
                          <details className="mt-0.5">
                            <summary className="cursor-pointer text-[10px] text-ink2 hover:text-ink">
                              prompt
                            </summary>
                            <p className="mt-1 max-w-[280px] whitespace-pre-wrap break-words rounded bg-surface p-1 text-[10px] leading-snug text-ink2">
                              {plan[p.id]!.prompt}
                            </p>
                          </details>
                        )}
                      </div>
                    ) : dropReasons?.[p.id] ? (
                      // Not in the cut, and this is why. The plan drops far
                      // more photos than it keeps — 29 of 61 on Aberdeen —
                      // and "—" made every one of them look the same as a
                      // photo the plan had never considered.
                      <span
                        className="text-[10px] text-ink2 leading-tight"
                        title={dropReasons[p.id]}
                      >
                        {truncate(dropReasons[p.id] as string, 52)}
                      </span>
                    ) : (
                      <span className="text-ink2" title="Not in the current plan">
                        —
                      </span>
                    )}
                    {/* Where the hero actually stands, next to the shot list
                        rather than in a toast that has already gone. The two
                        states are genuinely different: the plan OPENS on this
                        photo, or it has been told to and has not re-run yet. */}
                    {heroId === p.id &&
                      (plan?.[p.id]?.sort_order === 0 ? (
                        <div
                          className="mt-0.5 flex items-center gap-0.5 font-medium text-[10px] text-emerald-600"
                          title="Hand-picked opening shot, and the plan opens on it"
                        >
                          <Star size={9} /> hero
                        </div>
                      ) : (
                        <div
                          className="mt-0.5 flex items-center gap-0.5 font-medium text-[10px] text-amber-600"
                          title="Picked as the opening shot, but this plan was built before the pick — run Plan"
                        >
                          <Star size={9} /> hero — run Plan
                        </div>
                      ))}
                  </Td>
                  <Td className="tabular-nums">
                    {p.ai_score != null ? (
                      p.ai_score.toFixed(2)
                    ) : (
                      <span className="text-ink2">—</span>
                    )}
                    {!p.tagged_at && <div className="text-[10px] text-amber-600">untagged</div>}
                  </Td>
                  {isListing && (
                    <Td className="tabular-nums text-ink2">
                      {t.heroScore != null ? t.heroScore.toFixed(2) : '—'}
                    </Td>
                  )}
                  {!isListing && (
                    <Td>
                      {(p.applicable_buckets?.length ?? 0) === 0 ? (
                        <span className="text-ink2">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(p.applicable_buckets ?? []).map((b) => (
                            <span
                              key={b}
                              className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] uppercase text-ink2"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                  )}
                  {/* Community-tour rows drop this: every planned photo is in
                      the film by definition, and the column cost a slot in an
                      already-crowded grid (owner 2026-08-19). The listing
                      surface keeps it — there it names the clip index. */}
                  {isListing && (
                    <Td>
                      {inVideo ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Film size={12} />
                          {p.used_clip_index != null
                            ? `clip ${p.used_clip_index + 1}`
                            : (p.used_in?.join(', ') ?? 'yes')}
                        </span>
                      ) : (
                        <span className="text-ink2">no</span>
                      )}
                    </Td>
                  )}
                  <Td className="max-w-[280px] text-ink2">
                    {t.description ? (
                      <span title={t.description}>{truncate(t.description, 110)}</span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {t.tags.length === 0 ? (
                      <span className="text-ink2">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-line/60 px-1.5 py-0.5 text-[10px] text-ink2"
                          >
                            {tag}
                          </span>
                        ))}
                        {t.tags.length > 4 && (
                          <span className="text-[10px] text-ink2">+{t.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-ink2 text-[11px]">
        Approving an enhanced photo is what makes the next render use it — <em>ready</em> alone
        changes nothing.
      </p>

      {lightbox && (
        // A <button> backdrop, not a role="dialog" div: dismiss is the only
        // interaction here, and a button gets Enter/Space/focus for free —
        // PhotoReviewClient needs the div because it has its own key handling.
        <button
          type="button"
          aria-label="Close photo"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            className="max-h-full max-w-full object-contain"
          />
        </button>
      )}

      {clipLightbox && (
        <button
          type="button"
          aria-label="Close clip"
          onClick={() => setClipLightbox(null)}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
        >
          <video
            src={clipLightbox}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full"
          />
        </button>
      )}
    </section>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Does a ready clip exist for the engine the plan asked for? A photo can carry
 * an old clip from a previous plan (kenburns where the plan now says
 * depthflow), and that clip is what assemble would pick up — so "has a clip"
 * is not the same question as "matches the plan".
 */
/**
 * Which canvases this photo has no ready clip on.
 *
 * `[]` on the community tour, which has one canvas and whose rows carry a bare
 * `ClipStatus` rather than a surface pair.
 */
function missingSurfaces(p: PhotoRow): string[] {
  const slots = [p.clip, p.depthflow_clip, p.kenburns_clip];
  if (!slots.some(isSurfacePair)) return [];
  const out: string[] = [];
  for (const surface of ['ios', 'web'] as const) {
    const ready = slots.some((slot) => isSurfacePair(slot) && slot[surface]?.status === 'ready');
    if (!ready) out.push(surface);
  }
  return out;
}

/**
 * The local (unpaid) clip this photo has on one canvas, whichever engine made
 * it.
 *
 * Prefers a ready clip; falls back to an in-flight or failed one so the cell
 * can say what is happening instead of looking empty.
 */
function localClipFor(p: PhotoRow, surface: 'ios' | 'web'): ClipStatus | null {
  const slots = [p.depthflow_clip, p.kenburns_clip];
  for (const slot of slots) {
    if (isSurfacePair(slot) && slot[surface]?.status === 'ready') return slot[surface];
  }
  for (const slot of slots) {
    if (isSurfacePair(slot) && slot[surface]) return slot[surface];
  }
  return null;
}

function hasPlannedClip(p: PhotoRow, engine: string): boolean {
  const primary = (slot: ClipStatus | SurfaceClips | null | undefined) =>
    // For a listing the slot holds two canvases. "Rendered" means the PRIMARY
    // one is: iOS is what the feed plays, and a web-only clip is not the shot
    // the plan promised.
    isSurfacePair(slot) ? slot.ios : slot;

  // A ready Seedance clip satisfies ANY shot, because the assembler is
  // AI-first and will use it whatever the plan declared. Checking only the
  // planned engine printed "not rendered yet" on a photo whose paid clip was
  // sitting there ready — and would have been the one in the film.
  const seedance = primary(p.clip);
  if (seedance?.status === 'ready') return true;

  const slot =
    engine === 'seedance' ? p.clip : engine === 'depthflow' ? p.depthflow_clip : p.kenburns_clip;
  const clip = primary(slot);
  return clip?.engine === engine && clip.status === 'ready';
}

/**
 * Where a photo came from. Worth a column because provenance changes how the
 * pipeline treats the file: a hand-picked photo from the community's own site
 * outranks a Places photo of the same POI and is exempt from the 2-per-POI cap
 * (owner 2026-08-19), so "why did this one make the cut" is often answered
 * here. The source page is on the title so a doubtful photo can be traced.
 */
function PhotoSourceBadge({
  source,
  attribution,
}: {
  source?: string | null;
  attribution?: Record<string, unknown> | null;
}) {
  if (source === 'community_site') {
    const page = typeof attribution?.source_page === 'string' ? attribution.source_page : undefined;
    return (
      <span
        title={page ?? 'Community website'}
        className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
      >
        Website
      </span>
    );
  }
  // Google sources get a badge too, not plain grey text (owner 2026-08-19:
  // "use some color for google source as well"). The point of this column is
  // telling the two apart at a glance while scrolling, and only one of them
  // being a chip made the other read as "no source".
  if (source === 'google_streetview') {
    return (
      <span className="inline-block rounded bg-sky-50 px-1.5 py-0.5 font-medium text-[10px] text-sky-700">
        Street View
      </span>
    );
  }
  if (source === 'google_places') {
    return (
      <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 font-medium text-[10px] text-blue-700">
        Google
      </span>
    );
  }
  return <span className="text-[10px] text-ink2">{source ?? '—'}</span>;
}

/**
 * The reframe: the result itself, and how to undo it.
 *
 * Shows the reframed image rather than a link to it (owner 2026-08-19: "show
 * small photos directly in the table"), because this is the one column whose
 * output has to be judged by eye — the model re-renders rather than strictly
 * extends, and a bad result is obvious in a thumbnail and invisible in a
 * status word. Lambert High's aerial came back with the endzone reading
 * LAMBERNS instead of LONGHORNS; nothing but the picture would have caught it.
 *
 * Sized and styled to match the Enhanced column, and taller than it because the
 * output is portrait (owner 2026-08-19: "follow the same Enhanced column, show
 * bigger pictures and remove the text"). The "saved N%" caption that used to sit
 * beside it is gone — it read as a benefit score when it was really just the
 * crop that a centre-cut would have discarded, and the owner asked what it
 * meant. A `ready` reframe is live, so Use crop is the way back.
 */
function ReframedCell({
  photoId,
  status,
  meta,
  error,
  storageBase,
  bucket,
  path,
  onZoom,
  onChanged,
}: {
  photoId: string;
  status?: string | null;
  meta?: { reason?: string } | null;
  error?: string | null;
  storageBase: string;
  bucket: string;
  path?: string | null;
  onZoom: (url: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!status || status === 'none') return <span className="text-[10px] text-ink2">—</span>;
  if (status === 'skipped') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-ink2">
          {meta?.reason === 'rejected by admin' ? 'discarded' : 'not needed'}
        </span>
        <MiniBtn
          label="Reframe"
          title="Outpaint this photo to the render aspect — costs about $0.09"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await requeueOutpaint(photoId);
            setBusy(false);
            onChanged();
          }}
        />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="text-[10px] text-red-600" title={error ?? undefined}>
        failed
      </div>
    );
  }
  if (status !== 'ready') return <StatusText value={status} />;

  const href = path ? `${storageBase}/storage/v1/object/public/${bucket}/${path}` : null;
  return (
    <div className="flex flex-col gap-1">
      {href && <Thumb src={href} title="Reframed — view full-size" onClick={() => onZoom(href)} />}
      {/* "use crop" / "redo" meant nothing to the person using them (owner
          2026-08-19: "use cropredo - i dont know what is it"). Regenerate is
          the same verb the clip and enhance columns use; Discard says what
          happens rather than naming the thing you fall back to. */}
      <MiniBtn
        label="Regenerate"
        title="Reframe this photo again — costs about $0.09"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await requeueOutpaint(photoId);
          setBusy(false);
          onChanged();
        }}
      />
      <MiniBtn
        label="Discard"
        title="Throw this reframe away and render the original photo instead"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await rejectOutpaint(photoId);
          setBusy(false);
          onChanged();
        }}
      />
    </div>
  );
}

// Tight padding so ~15 columns fit one screen without a horizontal scroll
// (owner 2026-08-19: "make this a big table to show all columns in one page").
/**
 * ONE thumbnail size for every picture and every clip in the table.
 *
 * Owner 2026-08-19: "all picture and clips should follow the same format." The
 * cells had drifted to four sizes — h-14 w-20 landscape for the source photo,
 * h-16 w-12 for enhanced, h-24 w-14 for reframed, h-24 w-16 for clips — so a
 * row read as four unrelated things rather than one photo at four stages.
 *
 * Portrait at the render canvas's aspect, because that is the shape everything
 * here ends up as: 1080x1576 (see CANVAS_W/CANVAS_H). Landscape sources are
 * cover-cropped into it, which is also what the film does to them.
 */
const THUMB = 'block h-24 w-[66px] shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-line';

/** A still, sized and cropped like every other cell. */
function Thumb({ src, title, onClick }: { src: string; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={THUMB} title={title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

/**
 * One clip column: status, a playable poster at the shared size, and a
 * Generate/Regenerate button.
 *
 * Shared by Clip (Seedance), DA (DepthFlow) and KB (Ken Burns) so all three
 * behave and measure identically. They were one column showing whichever of
 * DepthFlow/Ken Burns happened to exist, which hid that a photo can have both
 * and that the one you wanted had failed (owner: "DA, KB — yes split these
 * two").
 */
function ClipCell({
  clip,
  webClip,
  showEngine,
  poster,
  label,
  canGenerate,
  disabledHint,
  busy,
  onGenerate,
  onPlay,
  onDiscard,
}: {
  clip?: ClipStatus | null;
  /**
   * The same engine's clip on the web canvas, when there is one.
   *
   * Rendered as a second line in this cell rather than a fourth, fifth and
   * sixth column. Undefined on the community tour, which has one canvas.
   */
  webClip?: ClipStatus | null;
  poster: string;
  /** What this column renders, for the button titles: "Seedance", "DepthFlow". */
  label: string;
  canGenerate: boolean;
  /** Show which engine produced the clip. A canvas-keyed column needs it —
   *  the column no longer says. */
  showEngine?: boolean;
  /** Why the button is missing. Rendered in its place — a column that simply
   *  goes blank reads as a bug, not as a rule. */
  disabledHint?: string;
  busy: boolean;
  onGenerate: () => void;
  onPlay: (url: string) => void;
  /** Paid engines only — a local clip is fixed by regenerating, not discarding. */
  onDiscard?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* No status word and no "no clip": the poster's presence says the clip
          is ready, and its absence says it is not (owner 2026-08-19: "remove
          all the text, just show the button, or pic/video with regenerate...
          still keep the time length and cost"). A render still in flight or
          failed is the one case with nothing to look at, so those two keep a
          word. */}
      {clip && clip.status !== 'ready' && (
        <span
          className={
            clip.status === 'failed' ? 'text-[10px] text-red-600' : 'text-[10px] text-ink2'
          }
          title={clip.error ?? undefined}
        >
          {clip.status}
        </span>
      )}
      {clip?.status === 'ready' && clip.video_url && (
        <button
          type="button"
          onClick={() => onPlay(clip.video_url as string)}
          className={`group relative ${THUMB}`}
          title={`Play the ${label} clip`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover opacity-80 transition group-hover:opacity-50"
          />
          <span className="absolute inset-0 flex items-center justify-center text-white text-xl">
            ▶
          </span>
        </button>
      )}
      {showEngine && clip?.engine && <span className="text-[10px] text-ink2">{clip.engine}</span>}
      {clip?.duration_s != null && (
        <span className="text-[10px] text-ink2 tabular-nums">{clip.duration_s}s</span>
      )}
      {clip?.cost_usd != null && (
        <span className="text-[10px] text-ink2 tabular-nums">${clip.cost_usd.toFixed(3)}</span>
      )}
      {!canGenerate && disabledHint && (
        <span className="text-[10px] text-ink2/70" title={disabledHint}>
          hero only
        </span>
      )}
      {canGenerate && (
        <MiniBtn
          label={clip ? 'Regenerate' : 'Generate'}
          title={
            clip
              ? `Re-render this ${label} clip with the current plan`
              : `Generate a ${label} clip from this photo`
          }
          disabled={busy}
          onClick={onGenerate}
        />
      )}
      {onDiscard && clip && clip.status !== 'rejected' && (
        <MiniBtn
          label="Discard"
          title={`Reject this ${label} clip so the tour stops using it`}
          disabled={busy}
          onClick={onDiscard}
        />
      )}
      {/* The web canvas, on one line. No second thumbnail: it is the same
          photo, and two per cell across three columns is exactly the space the
          owner asked back. Status and duration are what differ. */}
      {webClip !== undefined && (
        <div className="mt-1 flex items-center gap-1 border-line border-t pt-1 text-[10px]">
          <span className="text-ink2/60">web</span>
          {webClip === null ? (
            <span className="text-ink2/50">—</span>
          ) : webClip.status === 'ready' && webClip.video_url ? (
            <button
              type="button"
              onClick={() => onPlay(webClip.video_url as string)}
              className="text-ink2 underline hover:text-ink"
              title={`Play the 16:9 ${label} clip`}
            >
              play{webClip.duration_s != null ? ` · ${webClip.duration_s}s` : ''}
            </button>
          ) : (
            <span className={webClip.status === 'failed' ? 'text-red-600' : 'text-ink2'}>
              {webClip.status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className = '',
  hint,
}: {
  children: React.ReactNode;
  className?: string;
  /** One-line gloss under the label — owner 2026-08-19: "give some description
   *  for the column, for example, reframed can mention 2:3?" Fifteen terse
   *  headings ("DA", "KB", "Reframed") do not say what the column IS. */
  hint?: string;
}) {
  return (
    <th className={`px-1.5 py-1.5 align-top font-semibold ${className}`}>
      {/* align-top + a label line of fixed height: with align-bottom, a header
          that has a hint sat lower than one that does not, so the labels
          zig-zagged across the row (owner 2026-08-19: "should be bold and
          aligned in the same horizon"). */}
      <span className="block h-3.5 text-[10px] uppercase tracking-wide">{children}</span>
      {hint && (
        <span className="block font-normal text-[9px] text-ink2/70 normal-case tracking-normal">
          {hint}
        </span>
      )}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-1.5 py-1.5 ${className}`}>{children}</td>;
}

function StatusText({ value }: { value: string }) {
  const cls =
    value === 'approved'
      ? 'text-emerald-600'
      : value === 'ready'
        ? 'text-amber-600'
        : value === 'rejected' || value === 'failed'
          ? 'text-red-600'
          : value === 'queued' || value === 'processing'
            ? 'text-blue-600'
            : 'text-ink2';
  return <span className={cls}>{value}</span>;
}

function MiniBtn({
  label,
  title,
  active,
  danger,
  disabled,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls = active
    ? danger
      ? 'bg-red-500 text-white'
      : 'bg-emerald-500 text-white'
    : 'border border-line bg-bg text-ink2 hover:border-ink2';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium disabled:opacity-40 ${cls}`}
    >
      {label}
    </button>
  );
}

export type { EnhanceDecision };
