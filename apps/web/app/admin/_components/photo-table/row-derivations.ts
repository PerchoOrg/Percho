/**
 * The row shape `PhotoTable` renders, and the pure reads over it.
 *
 * No React here on purpose: these are the questions the table asks about a row
 * — which canvas is missing a clip, which local clip to show, whether the
 * planned engine has actually rendered — and they are answerable from the row
 * alone. Split out of `PhotoTable.tsx` on 2026-09-06.
 */

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
export function isSurfacePair(v: ClipStatus | SurfaceClips | null | undefined): v is SurfaceClips {
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

export function truncate(s: string, n: number) {
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
export function missingSurfaces(p: PhotoRow): string[] {
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
export function localClipFor(p: PhotoRow, surface: 'ios' | 'web'): ClipStatus | null {
  const slots = [p.depthflow_clip, p.kenburns_clip];
  for (const slot of slots) {
    if (isSurfacePair(slot) && slot[surface]?.status === 'ready') return slot[surface];
  }
  for (const slot of slots) {
    if (isSurfacePair(slot) && slot[surface]) return slot[surface];
  }
  return null;
}

export function hasPlannedClip(p: PhotoRow, engine: string): boolean {
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
