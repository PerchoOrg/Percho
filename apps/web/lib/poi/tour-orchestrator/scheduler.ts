/**
 * Scheduler — order, engine, move, duration. PURE.
 *
 * Same annotations in, same shot list out: no I/O, no clock, no unseeded
 * random. Every rotation is a hash of the photo id, which is what the existing
 * render worker already does (worker.py POI_CLIP_MODES), so a re-render of a
 * photo keeps its move.
 *
 * The LLM never picks an engine. The engine falls out of two things the code
 * owns: what the photo IS (Curator semantics) and how much of it the 9:16
 * canvas has to throw away (pixels).
 */

import type {
  DominantSubject,
  Engine,
  PhotoAnnotation,
  PhotoMeta,
  PlanWarning,
  ScheduledClip,
} from './types';

// ─── constants ──────────────────────────────────────────────────────────────

/** Every community-tour clip renders 9:16. */
export const TARGET_ASPECT = 9 / 16;

/**
 * Above this overflow a clip goes to Ken Burns, which reveals what the canvas
 * cannot show; below it there is nothing to travel to, so the clip spends
 * itself on parallax instead.
 *
 * 0.55, NOT the 0.20 that `scripts/ken-burns/depthflow_modes.py` uses for the
 * listing card. 0.20 is a landscape-canvas number: on 9:16 even a 3:4 portrait
 * overflows 0.250, so a 0.20 gate makes EVERY photo Ken Burns and DepthFlow
 * gets zero clips — in direct conflict with the 1/3-1/2 quota below. At 0.55 a
 * 3:4 portrait (0.250) and a 4:3 landscape (0.578) land on opposite sides,
 * which is exactly the split the quota wants. The listing path keeps 0.20; the
 * threshold is a function of the canvas, not a global.
 */
export const DEPTHFLOW_MAX_OVERFLOW = 0.55;

export const DEPTHFLOW_TARGET_SHARE = 0.4;
export const DEPTHFLOW_MIN_SHARE = 1 / 3;
export const DEPTHFLOW_MAX_SHARE = 1 / 2;
export const DEPTHFLOW_MIN_CLIPS = 2;

/** Cost gate: Seedance is ~$0.05/clip and the only paid engine here. */
export const SEEDANCE_MAX_CLIPS = 4;
/** Provider floor — the seedance worker clamps anything shorter up to 4s. */
export const SEEDANCE_MIN_DURATION = 4.0;

/** At/above this aspect a photo is a panorama: letterbox it, never crop it. */
export const PANORAMA_MIN_ASPECT = 2.0;

export const DURATION_BASE = 3.0;
export const DURATION_MIN = 2.0;
export const DURATION_MAX = 4.5;
/** Finished-film length the tour aims for (spec §9 Phase 3). */
export const TOUR_TARGET_MIN_S = 45;
export const TOUR_TARGET_MAX_S = 50;
/** Durations move in half seconds; anything finer is invisible on screen. */
const DURATION_STEP = 0.5;
/** Short side at/above which resolution stops shortening a clip. */
export const FULL_RES_SHORT_SIDE = 1080;

/**
 * Ken Burns catalogue — every name here has a branch in `kenburns_filter_v2`
 * (scripts/ken-burns/generate.py). That is the whole requirement, and it was
 * not met: this list was copied from the render worker, which carried the v1
 * names `zoom-in` / `zoom-out`. The v2 filter has no branch for either, so a
 * clip planned `zoom-out` rendered as a slow push-in — the opposite move,
 * reported by the owner on 2026-08-17.
 *
 * `pan_to_subject` and `static` exist in the filter but are left out on
 * purpose: pan_to_subject needs a subject bbox POI photos do not carry, and a
 * static clip is the "很多静止的图" the owner rejected on 2026-08-10.
 */
export const KEN_BURNS_MOVES = [
  'push_in',
  'push_in_slow',
  'pull_back',
  'pan_lr',
  'pan_rl',
  'push_pan_lr',
  'push_pan_rl',
  'tilt_td',
] as const;

/**
 * DepthFlow catalogue — 8 moves, NOT 10. orbit_to_subject and rack_focus were
 * rejected by the owner on 2026-08-09 and must not come back.
 */
export const DEPTHFLOW_MOVES = [
  'dolly_in',
  'zoom_in',
  'parallax_bloom',
  'zoom_out',
  'orbit_right',
  'orbit_left',
  'tilt_parallax',
  'static',
] as const;

/** Seedance "move" is a camera clause, not a render mode — see seedance-prompt. */
export const SEEDANCE_MOVES = [
  'camera_fixed',
  'drift_in',
  'pull_back',
  'tilt_up',
  'handheld_in',
] as const;

/**
 * Soft preference: which moves read as the right camera intent for a subject.
 * Loses to the no-repeat rule — two identical moves back to back is the one
 * collision a viewer actually notices.
 */
const KEN_BURNS_PREFERENCE: Partial<Record<DominantSubject, readonly string[]>> = {
  nature: ['push_in', 'push_in_slow'],
  building_facade: ['pan_lr', 'pan_rl', 'tilt_td'],
  open_space: ['pull_back', 'push_pan_rl'],
  interior_close: ['push_in_slow', 'push_pan_lr'],
};

const DEPTHFLOW_PREFERENCE: Partial<Record<DominantSubject, readonly string[]>> = {
  nature: ['dolly_in', 'zoom_in', 'parallax_bloom'],
  building_facade: ['orbit_right', 'orbit_left', 'tilt_parallax'],
  open_space: ['zoom_out', 'parallax_bloom'],
  interior_close: ['dolly_in', 'orbit_right'],
};

/** Subjects that can never be Seedance: geometry it would have to invent. */
const SEEDANCE_BLOCKED_SUBJECTS: readonly DominantSubject[] = [
  'interior_close',
  'building_facade',
  'street_perspective',
  'signage',
];

// ─── geometry ───────────────────────────────────────────────────────────────

/** The canvas every community-tour clip renders at. */
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;
/** Ken Burns pushes to 1.10, so the source has to carry that much extra. */
const ZOOM_HEADROOM = 1.1;

/**
 * How far a photo must be enlarged to fill the 9:16 canvas, zoom included.
 * Below 1.0 the photo is downscaled and loses nothing.
 *
 * Pixel count is the wrong measure here: at 2000px wide, a landscape frame and
 * a portrait one need completely different amounts of enlargement, because the
 * canvas is portrait. This is the number that predicts softness.
 */
export function upscaleFactor(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return Number.POSITIVE_INFINITY;
  // A panorama is letterboxed, not cropped, so it only has to reach the
  // canvas WIDTH — measuring it like a cover crop would condemn a 2000x947
  // frame that actually renders downscaled.
  const scale = isPanorama(widthPx, heightPx)
    ? Math.min(CANVAS_W / widthPx, CANVAS_H / heightPx)
    : Math.max(CANVAS_W / widthPx, CANVAS_H / heightPx);
  return scale * ZOOM_HEADROOM;
}

/**
 * Above this, a photo is dropped from the tour rather than rendered soft.
 *
 * 2.0 comes from two ends. Below it: the pipeline already shortens a low-res
 * clip to hide it, and a mild enlargement survives that. Above it: nothing
 * hides it — the owner flagged a 680x497 storefront that needed **4.25x**
 * (2026-08-17), and this repo has been here before, moving the Places fetch
 * from 1200px to 2400px because 1200px sources rendered "visibly mushy bark /
 * foliage / signage" (~1.76x on this canvas).
 *
 * Measured over 581 POI photos: 11% exceed 2.0x, and only 4 POIs of 82 have
 * nothing better. At 1.5x it would be 20% and 9 POIs — more coverage lost than
 * sharpness gained.
 */
export const MAX_UPSCALE = 2.0;

/** Too soft for a full-frame 9:16 clip, whatever the camera move. */
export function isTooLowRes(widthPx: number, heightPx: number): boolean {
  return upscaleFactor(widthPx, heightPx) > MAX_UPSCALE;
}

/**
 * Fraction of the photo the 9:16 canvas crops away.
 *
 * Known values (spec §4.1): 3024x4032 → 0.250, 3456x2304 → 0.625,
 * 2000x947 → 0.734.
 */
export function overflow(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return 0;
  const aspect = widthPx / heightPx;
  return aspect > TARGET_ASPECT ? 1 - TARGET_ASPECT / aspect : 1 - aspect / TARGET_ASPECT;
}

export function isPanorama(widthPx: number, heightPx: number): boolean {
  return heightPx > 0 && widthPx / heightPx >= PANORAMA_MIN_ASPECT;
}

/**
 * Clip length from emotional weight and short-side resolution.
 *
 * Low resolution shortens automatically — that is the rule form of "hide the
 * quality behind a short clip": 680x497 lands on the 2.0s floor at any
 * emotional weight.
 */
export function durationFor(
  emotionalWeight: number,
  widthPx: number,
  heightPx: number,
  engine: Engine,
): number {
  const emo = DURATION_BASE + (emotionalWeight - 0.5) * 3.0;
  const shortSide = Math.min(widthPx, heightPx);
  const resScale = Math.min(1, Math.max(0, shortSide / FULL_RES_SHORT_SIDE));
  const rounded = Math.round(emo * resScale * 2) / 2;
  const clamped = Math.min(DURATION_MAX, Math.max(DURATION_MIN, rounded));
  return engine === 'seedance' ? Math.max(clamped, SEEDANCE_MIN_DURATION) : clamped;
}

/**
 * Nudge clip lengths until the film lands in [45, 50]s.
 *
 * Per-clip duration is a judgement about that photo; film length is a
 * judgement about the viewer. Both matter, so the per-clip value sets the
 * starting point and this pass spends the remaining seconds where they do the
 * most good: lengthening the frames a viewer wants to linger on, shortening
 * the ones they do not. Every clip stays inside its own bounds, so a photo can
 * never be stretched past what it can carry.
 *
 * Mutates `durations` in place; returns whether the target was reached.
 */
function fitTotalDuration(durations: number[], weights: number[], engines: Engine[]): boolean {
  const floorFor = (i: number) =>
    engines[i] === 'seedance' ? Math.max(DURATION_MIN, SEEDANCE_MIN_DURATION) : DURATION_MIN;
  const total = () => durations.reduce((n, d) => n + d, 0);
  // Longest-first when growing, shortest-first when trimming; index breaks
  // ties so the pass is deterministic.
  const order = durations.map((_, i) => i);
  const byWeightDesc = [...order].sort((a, b) => weights[b]! - weights[a]! || a - b);
  const byWeightAsc = [...order].sort((a, b) => weights[a]! - weights[b]! || a - b);

  let guard = durations.length * 20;
  while (total() < TOUR_TARGET_MIN_S && guard-- > 0) {
    const i = byWeightDesc.find((k) => durations[k]! + DURATION_STEP <= DURATION_MAX);
    if (i === undefined) return false;
    durations[i] = durations[i]! + DURATION_STEP;
  }
  while (total() > TOUR_TARGET_MAX_S && guard-- > 0) {
    const i = byWeightAsc.find((k) => durations[k]! - DURATION_STEP >= floorFor(k));
    if (i === undefined) return false;
    durations[i] = durations[i]! - DURATION_STEP;
  }
  return total() >= TOUR_TARGET_MIN_S && total() <= TOUR_TARGET_MAX_S;
}

/** DepthFlow amplitude: the heavier the crop, the less it may move. */
export function depthflowAmplitude(clipOverflow: number): number {
  return Math.max(0.25, 1 - clipOverflow);
}

// ─── deterministic rotation ─────────────────────────────────────────────────

/**
 * Stable hash of a photo id. UUIDs use the same first-8-hex-chars rotation the
 * render worker already applies, so a photo keeps the move it had.
 */
export function stableHash(photoId: string): number {
  const hex = photoId.replace(/-/g, '').slice(0, 8);
  if (/^[0-9a-f]{8}$/i.test(hex)) return Number.parseInt(hex, 16);
  let h = 0x811c9dc5;
  for (let i = 0; i < photoId.length; i++) {
    h ^= photoId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ─── ordering ───────────────────────────────────────────────────────────────

interface Entry {
  annotation: PhotoAnnotation;
  meta: PhotoMeta;
  overflow: number;
  letterbox: boolean;
}

/** A pair renders as one indivisible unit: wide first, close second. */
interface Unit {
  entries: Entry[];
  time: number;
  emotion: number;
  bucket: string;
  role: PhotoAnnotation['narrative_role'];
}

function buildUnits(entries: Entry[]): Unit[] {
  const byId = new Map(entries.map((e) => [e.annotation.photo_id, e]));
  const consumed = new Set<string>();
  const units: Unit[] = [];

  for (const e of entries) {
    const id = e.annotation.photo_id;
    if (consumed.has(id)) continue;
    const partnerId = e.annotation.poi_pair_with;
    const partner = partnerId ? byId.get(partnerId) : undefined;
    if (partner && !consumed.has(partnerId!) && partner.annotation.poi_pair_with === id) {
      const wide = e.annotation.pair_role === 'wide' ? e : partner;
      const close = wide === e ? partner : e;
      consumed.add(id);
      consumed.add(partnerId!);
      units.push({
        entries: [wide, close],
        time: Math.min(wide.annotation.time_of_day, close.annotation.time_of_day),
        emotion: Math.max(wide.annotation.emotional_weight, close.annotation.emotional_weight),
        bucket: wide.meta.bucket,
        // The wide half carries the unit's narrative role; a "detail" close-up
        // must not drag an establishing pair to the back of the tour.
        role: wide.annotation.narrative_role,
      });
      continue;
    }
    consumed.add(id);
    units.push({
      entries: [e],
      time: e.annotation.time_of_day,
      emotion: e.annotation.emotional_weight,
      bucket: e.meta.bucket,
      role: e.annotation.narrative_role,
    });
  }
  return units;
}

function unitId(u: Unit): string {
  return u.entries[0]!.annotation.photo_id;
}

/**
 * Two acts: the community, then everything around it.
 *
 * Owner 2026-08-19: "we should present community itself first before
 * presenting outside". Biasing only the opener (phase56) put one amenity clip
 * up front and then let spreadBuckets scatter the rest through the film, so
 * the pool turned up between a temple and a coffee shop. A buyer should see
 * the place they would live as a whole first, and the neighbourhood second.
 *
 * The acts are ordered independently. spreadBuckets runs on the surroundings
 * act only: inside the community act every unit is the same bucket by
 * definition, so the anti-monotony rule has nothing to trade and variety comes
 * from the POIs themselves (gate, pool, clubhouse, courts).
 *
 * With no amenities the first act is empty and this is exactly the previous
 * behaviour — which is what keeps the listing path untouched.
 */
function orderUnits(units: Unit[]): Unit[] {
  const community = units.filter((u) => u.bucket === 'amenities');
  const surroundings = units.filter((u) => u.bucket !== 'amenities');
  return [...orderCommunityAct(community), ...orderSurroundingsAct(surroundings)];
}

/** Widest, most inviting frame first; the rest by time of day. */
function orderCommunityAct(units: Unit[]): Unit[] {
  if (units.length === 0) return [];
  // The Curator labels at most one photo per batch 'opener' and picks it on
  // photographic merit, so it rarely lands on an amenity. A wide
  // 'establishing' shot opens just as well — that is the Curator's own
  // definition of establishing ("introduces a POI at wide framing").
  const leadRank = (u: Unit): number => {
    if (u.role === 'opener') return 0;
    if (u.role === 'establishing') return 1;
    return 2;
  };
  const [lead, ...rest] = [...units].sort(
    (a, b) =>
      leadRank(a) - leadRank(b) || b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)),
  );
  const body = rest.sort(
    (a, b) => a.time - b.time || b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)),
  );
  return lead ? [lead, ...body] : body;
}

/** The original ordering: opener, the day in order, closer — then spread. */
function orderSurroundingsAct(units: Unit[]): Unit[] {
  if (units.length === 0) return [];
  const byTime = [...units].sort(
    (a, b) => a.time - b.time || b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)),
  );

  const pickRole = (role: 'opener' | 'closer'): Unit | undefined => {
    const held = byTime.filter((u) => u.role === role);
    if (held.length === 0) return undefined;
    return [...held].sort((a, b) => b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)))[0];
  };

  const opener = pickRole('opener');
  const closer = pickRole('closer') === opener ? undefined : pickRole('closer');
  const middle = byTime.filter((u) => u !== opener && u !== closer);
  const ordered = [...(opener ? [opener] : []), ...middle, ...(closer ? [closer] : [])];
  return spreadBuckets(ordered);
}

/**
 * No bucket may occupy more than 2 consecutive CLIPS. When it would, pull the
 * first later unit with a different bucket forward. Units move whole — pulling
 * one photo out of a wide→close pair is worse than a third park shot in a row.
 * Opener and closer are pinned and never move.
 */
function spreadBuckets(ordered: Unit[]): Unit[] {
  const out = [...ordered];
  const lastIndex = out.length - 1;
  let run = 0;
  let runBucket: string | null = null;

  for (let i = 0; i < out.length; i++) {
    const u = out[i]!;
    const size = u.entries.length;
    if (u.bucket === runBucket) {
      if (run + size > 2 && i > 0 && i < lastIndex) {
        const j = out.findIndex((v, k) => k > i && v.bucket !== u.bucket && k < lastIndex);
        if (j > i) {
          const [moved] = out.splice(j, 1);
          out.splice(i, 0, moved!);
          // Re-read this slot: the unit now sitting here is the moved one.
          i--;
          continue;
        }
      }
      run += size;
    } else {
      runBucket = u.bucket;
      run = size;
    }
  }
  return out;
}

// ─── engines ────────────────────────────────────────────────────────────────

function seedanceEligible(e: Entry): boolean {
  const a = e.annotation;
  if (e.letterbox) return false;
  if (!a.has_natural_motion) return false;
  if (SEEDANCE_BLOCKED_SUBJECTS.includes(a.dominant_subject)) return false;
  if (a.has_readable_brand_signage) return false;
  if (a.people_prominence === 'foreground') return false;
  return true;
}

/** DepthFlow count for a non-Seedance pool of `n`: 0.40 target, [1/3, 1/2]. */
export function depthflowQuota(n: number): number {
  if (n <= 0) return 0;
  const lo = Math.ceil(n * DEPTHFLOW_MIN_SHARE);
  const hi = Math.floor(n * DEPTHFLOW_MAX_SHARE);
  const target = Math.round(n * DEPTHFLOW_TARGET_SHARE);
  const withinBand = Math.min(Math.max(target, lo), Math.max(hi, lo));
  return Math.min(n, Math.max(withinBand, Math.min(DEPTHFLOW_MIN_CLIPS, n)));
}

function assignEngines(ordered: Entry[], warnings: PlanWarning[]): Engine[] {
  const n = ordered.length;
  const engines: Engine[] = new Array(n).fill('kenburns');

  // Seedance: strongest eligible frames, hard-capped by cost.
  const eligible = ordered
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => seedanceEligible(e))
    .sort(
      (a, b) =>
        b.e.annotation.emotional_weight - a.e.annotation.emotional_weight ||
        a.e.annotation.photo_id.localeCompare(b.e.annotation.photo_id),
    )
    .slice(0, SEEDANCE_MAX_CLIPS);
  for (const { i } of eligible) engines[i] = 'seedance';

  // DepthFlow: quota is the hard constraint, the overflow threshold is a
  // preference. A pool short on qualifying photos gets filled anyway, loudly.
  const pool = ordered.map((e, i) => ({ e, i })).filter(({ i }) => engines[i] !== 'seedance');
  const quota = depthflowQuota(pool.length);
  const byOverflow = [...pool].sort(
    (a, b) =>
      a.e.overflow - b.e.overflow || a.e.annotation.photo_id.localeCompare(b.e.annotation.photo_id),
  );
  const qualifying = byOverflow.filter(
    ({ e }) => !e.letterbox && e.overflow <= DEPTHFLOW_MAX_OVERFLOW,
  );
  const chosen = qualifying.slice(0, quota);
  if (chosen.length < quota) {
    for (const cand of byOverflow) {
      if (chosen.length >= quota) break;
      if (chosen.some((c) => c.i === cand.i)) continue;
      if (cand.e.letterbox) continue; // a panorama is never parallaxed
      chosen.push(cand);
      warnings.push({
        code: 'depthflow_quota_over_threshold',
        photo_id: cand.e.annotation.photo_id,
        detail: `overflow ${cand.e.overflow.toFixed(3)} > ${DEPTHFLOW_MAX_OVERFLOW} but the quota (${quota}) is hard`,
      });
    }
  }
  for (const { i } of chosen) engines[i] = 'depthflow';

  repairAdjacency(engines, byOverflow, warnings, ordered);
  return engines;
}

/**
 * Back to back, parallax stops reading as an accent. Swap the later of two
 * neighbours with the cheapest Ken Burns clip that can take it; if nothing can,
 * demote and say so — a silent demotion leaves review with nothing to judge.
 */
function repairAdjacency(
  engines: Engine[],
  byOverflow: Array<{ e: Entry; i: number }>,
  warnings: PlanWarning[],
  ordered: Entry[],
): void {
  const isFree = (k: number): boolean =>
    engines[k] === 'kenburns' &&
    !ordered[k]!.letterbox &&
    engines[k - 1] !== 'depthflow' &&
    engines[k + 1] !== 'depthflow';

  for (let i = 1; i < engines.length; i++) {
    if (engines[i] !== 'depthflow' || engines[i - 1] !== 'depthflow') continue;
    engines[i] = 'kenburns';
    const swap = byOverflow.find(({ i: k }) => k !== i && isFree(k));
    if (swap) {
      engines[swap.i] = 'depthflow';
      continue;
    }
    warnings.push({
      code: 'depthflow_adjacent_demoted',
      photo_id: ordered[i]!.annotation.photo_id,
      detail: 'adjacent DepthFlow with no swap partner → Ken Burns',
    });
  }
}

// ─── moves ──────────────────────────────────────────────────────────────────

/** Seedance camera clause for a subject — see SEEDANCE_CAMERA in seedance-prompt. */
function seedanceSubjectMove(e: Entry): string {
  if (e.annotation.dominant_subject === 'nature' && e.overflow <= DEPTHFLOW_MAX_OVERFLOW) {
    // Nothing to reveal and the water/foliage is the point: lock the frame and
    // let the only motion in the clip be the motion that is really there.
    return 'camera_fixed';
  }
  switch (e.annotation.dominant_subject) {
    case 'nature':
      return 'drift_in';
    case 'open_space':
      return 'pull_back';
    case 'building_facade':
      return 'tilt_up';
    case 'interior_close':
      return 'handheld_in';
    default:
      return 'drift_in';
  }
}

/**
 * Seedance move, with the same no-repeat rule the other engines get. Two
 * open_space frames in a row both want a pull-back, and back to back that
 * reads as one shot cut in half.
 *
 * The fallback order is by how little it assumes: a locked frame is safe on
 * any Seedance clip (the natural motion carries it), and a slow drift is the
 * next most neutral. Subject intent yields to the repeat rule, never the
 * reverse.
 */
function seedanceMove(e: Entry, previousMove: string | null): string {
  const preferred = seedanceSubjectMove(e);
  if (preferred !== previousMove) return preferred;
  for (const fallback of ['camera_fixed', 'drift_in', 'pull_back'] as const) {
    if (fallback !== previousMove) return fallback;
  }
  return preferred;
}

/**
 * Move for one clip. Deterministic in the photo id; avoids repeating the
 * previous clip's move, and gives up on the subject preference before it gives
 * up on the no-repeat rule.
 */
export function moveFor(
  engine: 'depthflow' | 'kenburns',
  subject: DominantSubject,
  photoId: string,
  previousMove: string | null,
  letterbox: boolean,
): string {
  if (letterbox) {
    // A panorama travels sideways across a letterboxed frame — that is the
    // whole point of not cropping it.
    const sides = ['pan_lr', 'pan_rl'] as const;
    const pick = sides[stableHash(photoId) % 2]!;
    return pick === previousMove ? (pick === 'pan_lr' ? 'pan_rl' : 'pan_lr') : pick;
  }
  const catalogue: readonly string[] = engine === 'depthflow' ? DEPTHFLOW_MOVES : KEN_BURNS_MOVES;
  const preferred =
    (engine === 'depthflow' ? DEPTHFLOW_PREFERENCE : KEN_BURNS_PREFERENCE)[subject] ?? catalogue;
  const rotate = stableHash(photoId);
  for (const list of [preferred, catalogue]) {
    for (let step = 0; step < list.length; step++) {
      const move = list[(rotate + step) % list.length]!;
      if (move !== previousMove) return move;
    }
  }
  return catalogue[rotate % catalogue.length]!;
}

// ─── entry point ────────────────────────────────────────────────────────────

export interface SchedulePlan {
  clips: ScheduledClip[];
  warnings: PlanWarning[];
}

/**
 * Build the shot list. Photos without an annotation (or without pixel
 * dimensions) are skipped — the Curator is the gate on what enters a tour.
 */
export function scheduleClips(annotations: PhotoAnnotation[], photos: PhotoMeta[]): SchedulePlan {
  const warnings: PlanWarning[] = [];
  const metaById = new Map(photos.map((p) => [p.photo_id, p]));

  const entries: Entry[] = [];
  for (const annotation of annotations) {
    const meta = metaById.get(annotation.photo_id);
    if (!meta || !(meta.width_px > 0) || !(meta.height_px > 0)) continue;
    entries.push({
      annotation,
      meta,
      overflow: overflow(meta.width_px, meta.height_px),
      letterbox: isPanorama(meta.width_px, meta.height_px),
    });
  }

  const ordered = orderUnits(buildUnits(entries)).flatMap((u) => u.entries);
  const engines = assignEngines(ordered, warnings);

  const clips: ScheduledClip[] = [];
  let previousMove: string | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]!;
    const engine = engines[i]!;
    const move: string =
      engine === 'seedance'
        ? seedanceMove(e, previousMove)
        : moveFor(
            engine,
            e.annotation.dominant_subject,
            e.annotation.photo_id,
            previousMove,
            e.letterbox,
          );
    previousMove = move;
    clips.push({
      photo_id: e.annotation.photo_id,
      poi_id: e.meta.poi_id,
      poi_name: e.meta.poi_name,
      bucket: e.meta.bucket,
      sort_order: i,
      engine,
      move,
      duration_s: durationFor(
        e.annotation.emotional_weight,
        e.meta.width_px,
        e.meta.height_px,
        engine,
      ),
      overflow: e.overflow,
      letterbox: e.letterbox,
      camera_fixed: engine === 'seedance' && move === 'camera_fixed',
      vo_line: e.annotation.vo_line,
      chip_label: e.annotation.chip_label,
    });
  }

  const durations = clips.map((c) => c.duration_s);
  const fitted = fitTotalDuration(
    durations,
    ordered.map((e) => e.annotation.emotional_weight),
    engines,
  );
  clips.forEach((c, i) => {
    c.duration_s = durations[i]!;
  });
  if (!fitted) {
    const total = durations.reduce((n, d) => n + d, 0);
    warnings.push({
      code: 'tour_duration_off_target',
      photo_id: '',
      detail: `${total.toFixed(1)}s outside [${TOUR_TARGET_MIN_S}, ${TOUR_TARGET_MAX_S}] — ${clips.length} clips cannot reach it within per-clip bounds`,
    });
  }

  return { clips, warnings };
}
