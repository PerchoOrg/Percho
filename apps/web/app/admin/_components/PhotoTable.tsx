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

import {
  type EnhanceDecision,
  type PhotoTable as PhotoTableName,
  queuePhotoEnhancement,
  setEnhancedDecision,
} from '@/lib/poi/admin-enhance-actions';
import { rejectOutpaint, requeueOutpaint } from '@/lib/poi/admin-outpaint-actions';
import { setGlobalPhotoStatus } from '@/lib/poi/admin-photo-actions';
import { projectTags, resolutionWarning } from '@/lib/poi/photo-tag-view';
import { Check, Film, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export interface PhotoRow {
  id: string;
  storage_path: string;
  // listing_photos only
  sort_order?: number | null;
  width?: number | null;
  height?: number | null;
  used_in_video_at?: string | null;
  used_clip_index?: number | null;
  // poi_photos only
  width_px?: number | null;
  height_px?: number | null;
  status?: string | null;
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
  /** Community tour: per-photo clip status (photo_clips cache). */
  clip?: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
  /** Community tour: depthflow/kenburns clip (separate row per photo+engine). */
  dakb_clip?: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
}

type SortKey = 'order' | 'score' | 'hero' | 'category' | 'enhanced';
type Filter = 'all' | 'untagged' | 'unreviewed' | 'enhance_ready' | 'in_video' | 'not_in_video';

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

/** The engine a DA+KB re-render should use, or null if the plan says Seedance. */
function plannedLocalEngine(engine: string | undefined): string | null {
  return engine === 'depthflow' || engine === 'kenburns' ? engine : null;
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
  onGenerateClip?: (photoId: string, engine?: string) => Promise<{ ok: boolean; message?: string }>;
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

  const isListing = table === 'listing_photos';
  const url = (p: string) => `${storageBase}/storage/v1/object/public/${bucket}/${p}`;

  /**
   * How many columns the header actually renders. Kept next to the header so
   * the two move together — a section row's colSpan has to match exactly, and
   * guessing high does not degrade gracefully (see the header row below).
   */
  const columnCount =
    2 + // Photo, then # / POI
    (isListing ? 0 : 1) + // Review
    (isListing ? 0 : 1) + // Source
    2 + // Size, Category
    (isListing ? 0 : 1) + // Plan / Dropped because
    1 + // Score
    (isListing ? 1 : 0) + // Hero
    (isListing ? 0 : 3) + // Buckets, Clip, DA+KB
    (isListing ? 1 : 0) + // In video (listing surface only)
    (isListing ? 0 : 1) + // Reframed
    3; // Enhanced, AI description, AI tags

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
          return (p.status ?? 'pending') === 'pending';
        case 'enhance_ready':
          return p.enhanced_status === 'ready';
        case 'in_video':
          return inVideo;
        case 'not_in_video':
          return !inVideo && (t.usable ?? true);
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
  }, [photos, sort, filter]);

  /**
   * The table is grouped by review verdict: Approved, Rejected, then Other.
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
      if (r.p.status === 'approved') approved.push(r);
      else if (r.p.status === 'rejected') rejected.push(r);
      else other.push(r);
    }
    const out: Array<{ header: string; count: number } | Row> = [];
    for (const [label, group] of [
      ['Approved Photos', approved],
      ['Rejected Photos', rejected],
      ['Other Photos', other],
    ] as const) {
      if (group.length === 0) continue;
      out.push({ header: label, count: group.length });
      out.push(...group);
    }
    return out;
  }, [rows]);

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

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-surface text-ink2">
            <tr>
              {!isListing && <Th>Review</Th>}
              <Th>Photo</Th>
              <Th>{isListing ? '#' : 'POI'}</Th>
              {!isListing && <Th>Source</Th>}
              <Th>Size</Th>
              <Th>Category</Th>
              {!isListing &&
                (dropReasons ? (
                  <Th className="min-w-[120px]">Dropped because</Th>
                ) : (
                  <Th className="min-w-[110px]">Plan</Th>
                ))}
              <Th>Score</Th>
              {isListing && <Th>Hero</Th>}
              {!isListing && <Th>Buckets</Th>}
              {!isListing && <Th>Clip</Th>}
              {!isListing && <Th>DA+KB</Th>}
              {isListing && <Th>In video</Th>}
              {!isListing && <Th>Reframed</Th>}
              <Th>Enhanced</Th>
              <Th className="min-w-[160px]">AI description</Th>
              <Th className="min-w-[110px]">AI tags</Th>
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
              const res = resolutionWarning(w, h);
              const busy = pending === p.id || pending === 'bulk';
              const showEnhanced = p.enhanced_status === 'approved' && p.enhanced_path;
              const thumbPath = showEnhanced ? (p.enhanced_path as string) : p.storage_path;
              return (
                <tr key={p.id} className="border-line border-t align-top hover:bg-surface/60">
                  <Td>
                    <div className="flex flex-col gap-1">
                      {!isListing && (
                        <>
                          {t.usable === false ? (
                            <span className="text-red-600">rejected</span>
                          ) : (
                            <StatusText value={p.status ?? 'pending'} />
                          )}
                          <div className="flex gap-1">
                            <MiniBtn
                              label={<Check size={11} />}
                              title="Approve photo (platform-wide) — the only gate for final video material"
                              active={p.status === 'approved'}
                              disabled={busy}
                              onClick={() =>
                                run(p.id, () => setGlobalPhotoStatus(p.id, 'approved'))
                              }
                            />
                            <MiniBtn
                              label={<X size={11} />}
                              title="Reject photo — removes it from every video pool"
                              danger
                              active={p.status === 'rejected'}
                              disabled={busy}
                              onClick={() =>
                                run(p.id, () => setGlobalPhotoStatus(p.id, 'rejected'))
                              }
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({ url: url(thumbPath), alt: t.description ?? 'photo' })
                      }
                      className="block h-14 w-20 overflow-hidden rounded-md ring-1 ring-line"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url(thumbPath)} alt="" className="h-full w-full object-cover" />
                    </button>
                  </Td>
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
                  {!isListing && dropReasons && (
                    <Td>
                      <span className="text-ink2">{dropReasons[p.id] ?? 'dropped'}</span>
                    </Td>
                  )}
                  {!isListing && !dropReasons && (
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
                          {!hasPlannedClip(p, plan[p.id]!.engine) && (
                            <div
                              className="text-[10px] text-amber-600"
                              title="No ready clip for the planned engine — click Generate on this row (or Re-render all DA+KB) to render the plan"
                            >
                              not rendered yet
                            </div>
                          )}
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
                      ) : (
                        <span
                          className="text-ink2"
                          title="Not in the current plan — re-run the photos step"
                        >
                          —
                        </span>
                      )}
                    </Td>
                  )}
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
                  {!isListing && (
                    <Td>
                      {p.clip ? (
                        <div className="flex flex-col gap-1">
                          <StatusText value={p.clip.status} />
                          {p.clip.status === 'ready' && p.clip.video_url && (
                            <button
                              type="button"
                              onClick={() => setClipLightbox(p.clip!.video_url)}
                              className="group relative block h-24 w-16 overflow-hidden rounded-md bg-black"
                              title="Click to play the generated clip"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url(thumbPath)}
                                alt=""
                                className="h-full w-full object-cover opacity-80 transition group-hover:opacity-50"
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-xl text-white">
                                ▶
                              </span>
                            </button>
                          )}
                          {p.clip.cost_usd != null && (
                            <span className="text-[10px] text-ink2">
                              ${p.clip.cost_usd.toFixed(2)}
                            </span>
                          )}
                          {p.clip.error && (
                            <span className="text-[10px] text-red-600" title={p.clip.error}>
                              {truncate(p.clip.error, 40)}
                            </span>
                          )}
                          {onGenerateClip && (
                            <MiniBtn
                              label={p.clip.status === 'ready' ? 'Regenerate' : 'Generate'}
                              title={
                                p.clip.status === 'ready'
                                  ? 'Re-render this seedance clip with the current plan'
                                  : 'Generate a seedance clip from this photo'
                              }
                              disabled={!!pending}
                              onClick={() => onGenerateClip(p.id, 'seedance')}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-ink2">no clip</span>
                          {onGenerateClip && (
                            <MiniBtn
                              label="Generate"
                              title="Generate a seedance clip from this photo"
                              disabled={!!pending}
                              onClick={() => onGenerateClip(p.id, 'seedance')}
                            />
                          )}
                        </div>
                      )}
                    </Td>
                  )}
                  {!isListing && (
                    <Td>
                      {p.dakb_clip ? (
                        <div className="flex flex-col gap-1">
                          <StatusText value={p.dakb_clip.status} />
                          {p.dakb_clip.status === 'ready' && p.dakb_clip.video_url && (
                            <button
                              type="button"
                              onClick={() => setClipLightbox(p.dakb_clip!.video_url)}
                              className="group relative block h-24 w-16 overflow-hidden rounded-md bg-black"
                              title="Click to play the DA+KB clip"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url(thumbPath)}
                                alt=""
                                className="h-full w-full object-cover opacity-80 transition group-hover:opacity-50"
                              />
                              <span className="absolute inset-0 flex items-center justify-center text-xl text-white">
                                ▶
                              </span>
                            </button>
                          )}
                          {p.dakb_clip.error && (
                            <span className="text-[10px] text-red-600" title={p.dakb_clip.error}>
                              {truncate(p.dakb_clip.error, 40)}
                            </span>
                          )}
                          {onGenerateClip && (
                            <MiniBtn
                              label={p.dakb_clip.status === 'ready' ? 'Regenerate' : 'Generate'}
                              title={
                                p.dakb_clip.status === 'ready'
                                  ? 'Re-render this clip with the current plan (move + duration)'
                                  : 'Generate a DA+KB clip from this photo'
                              }
                              disabled={busy}
                              onClick={() =>
                                run(p.id, () =>
                                  // Follow the PLAN's engine, not the existing
                                  // clip's: a re-plan may have moved this photo
                                  // from kenburns to depthflow.
                                  onGenerateClip(
                                    p.id,
                                    plannedLocalEngine(plan?.[p.id]?.engine) ??
                                      p.dakb_clip?.engine ??
                                      'kenburns',
                                  ),
                                )
                              }
                            />
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-ink2">no clip</span>
                          {onGenerateClip && (
                            <MiniBtn
                              label="Generate"
                              title="Generate a DA+KB clip from this photo"
                              disabled={busy}
                              onClick={() =>
                                run(p.id, () =>
                                  onGenerateClip(
                                    p.id,
                                    plannedLocalEngine(plan?.[p.id]?.engine) ?? 'kenburns',
                                  ),
                                )
                              }
                            />
                          )}
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
                    <StatusText value={p.enhanced_status ?? 'none'} />
                    {p.enhanced_meta?.chain && (
                      <div className="text-[10px] text-ink2" title={p.enhanced_meta.chain}>
                        {[
                          p.enhanced_meta.sr === 'real-esrgan-x2' ? 'ESRGAN' : null,
                          p.enhanced_meta.straighten_deg != null
                            ? `straighten ${p.enhanced_meta.straighten_deg}\u00b0`
                            : null,
                          p.enhanced_meta.exposure_gain != null &&
                          Math.abs(p.enhanced_meta.exposure_gain - 1) >= 0.01
                            ? `exp ${p.enhanced_meta.exposure_gain}\u00d7`
                            : null,
                          p.enhanced_meta.chain.includes('indoor_wb') ? 'indoor WB' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'base grade only'}
                      </div>
                    )}
                    {p.enhanced_error && (
                      <div className="text-[10px] text-red-600" title={p.enhanced_error}>
                        {truncate(p.enhanced_error, 40)}
                      </div>
                    )}
                    {p.enhanced_path ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            url: url(p.enhanced_path as string),
                            alt: 'enhanced',
                          })
                        }
                        className="mt-1 block h-16 w-12 overflow-hidden rounded border border-line bg-black"
                        title="Click to view enhanced photo full-size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url(p.enhanced_path as string)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="mt-1 text-[10px] text-ink2">pending enhance</div>
                    )}
                  </Td>
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
function hasPlannedClip(p: PhotoRow, engine: string): boolean {
  const clip = engine === 'seedance' ? p.clip : p.dakb_clip;
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
      <div className="text-[10px] text-ink2">
        <div>{meta?.reason === 'rejected by admin' ? 'using crop' : 'well framed'}</div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await requeueOutpaint(photoId);
            setBusy(false);
            onChanged();
          }}
          className="mt-0.5 underline hover:text-ink disabled:opacity-50"
        >
          {busy ? '…' : 'reframe'}
        </button>
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
    <div>
      {href && (
        <button
          type="button"
          onClick={() => onZoom(href)}
          className="block h-24 w-14 overflow-hidden rounded border border-line bg-black"
          title="Reframed — click to view full-size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt="" className="h-full w-full object-cover" />
        </button>
      )}
      <div className="mt-1 text-[10px] text-ink2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await rejectOutpaint(photoId);
            setBusy(false);
            onChanged();
          }}
          className="underline hover:text-ink disabled:opacity-50"
        >
          {busy ? '…' : 'use crop'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await requeueOutpaint(photoId);
            setBusy(false);
            onChanged();
          }}
          className="ml-1.5 underline hover:text-ink disabled:opacity-50"
          title="Generate a new one — costs about $0.09"
        >
          redo
        </button>
      </div>
    </div>
  );
}

// Tight padding so ~15 columns fit one screen without a horizontal scroll
// (owner 2026-08-19: "make this a big table to show all columns in one page").
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-1.5 py-1.5 font-medium text-[10px] uppercase tracking-wide ${className}`}>
      {children}
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
