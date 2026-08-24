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

import { amenityOrder } from './amenity';
import type {
  DominantSubject,
  Engine,
  PhotoAnnotation,
  PhotoMeta,
  PlanWarning,
  ScheduledClip,
} from './types';

// ─── constants ──────────────────────────────────────────────────────────────

// TARGET_ASPECT is derived from the canvas and declared with it, below.

/**
 * Above this overflow a clip goes to Ken Burns, which reveals what the canvas
 * cannot show; below it there is nothing to travel to, so the clip spends
 * itself on parallax instead.
 *
 * The threshold is a function of the CANVAS, not a global — the listing path
 * keeps its own 0.20 in `scripts/ken-burns/depthflow_modes.py`, which is a
 * landscape-canvas number.
 *
 * The split this has to produce is unchanged: a 3:4 portrait goes to DepthFlow,
 * a 4:3 landscape to Ken Burns. What moved is where those two land, because
 * overflow is measured against the canvas:
 *
 *              3:4 portrait   4:3 landscape   threshold
 *   9:16        0.250          0.578          0.55
 *   0.685       0.087          0.486          0.30   ← both fell below 0.55
 *
 * Leaving 0.55 after the canvas change would have sent BOTH shapes to DepthFlow
 * and left Ken Burns to whatever the 1/3-1/2 quota clawed back — the same
 * failure mode as the old 0.20, mirrored. 0.30 is the midpoint of the new pair.
 */
export const DEPTHFLOW_MAX_OVERFLOW = 0.3;

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
/**
 * Finished-film length the tour aims for.
 *
 * Was [45, 50] (spec §9 Phase 3), when a tour was neighbourhood POIs only.
 * Owner 2026-08-19 raised the ceiling to 90s: a community film now carries two
 * acts — the community's own amenities and then the surroundings — and 50
 * seconds cannot hold both without cutting one to a token appearance.
 *
 * Considered and rejected on 2026-08-20: raising it to 120s alongside the
 * surrounding budget going 10 -> 15 (owner: "actually dont raise to 2 mins,
 * keep 90s"). The consequence is real and worth knowing — the ceiling is what
 * `fitDuration` compresses clips against, so fifteen places inside 90s pushes
 * clips toward their 2s floor. If clips start reading as too short, this is
 * the number, and `tour_duration_off_target` is the warning that says so.
 */
export const TOUR_TARGET_MIN_S = 45;
export const TOUR_TARGET_MAX_S = 90;
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

/**
 * Orbit leads wherever it plausibly fits. Owner 2026-08-19: "orbit effect is
 * good, we should give it more weight."
 *
 * Orbit is the move that most reads as a camera rather than a pan across a
 * still — it swings around the subject, so the parallax it exposes is the whole
 * point of running DepthFlow on the frame at all. It now heads every subject's
 * list except `nature`, where there is usually no single subject to orbit and a
 * push through the depth reads better.
 *
 * These are preferences, not assignments: the no-repeat rule still outranks
 * them, so two neighbouring DepthFlow clips will not both orbit.
 */
const DEPTHFLOW_PREFERENCE: Partial<Record<DominantSubject, readonly string[]>> = {
  nature: ['dolly_in', 'orbit_left', 'zoom_in', 'parallax_bloom'],
  building_facade: ['orbit_right', 'orbit_left', 'tilt_parallax'],
  open_space: ['orbit_left', 'orbit_right', 'zoom_out', 'parallax_bloom'],
  interior_close: ['orbit_right', 'orbit_left', 'dolly_in'],
};

/** Subjects that can never be Seedance: geometry it would have to invent. */
const SEEDANCE_BLOCKED_SUBJECTS: readonly DominantSubject[] = [
  'interior_close',
  'building_facade',
  'street_perspective',
  'signage',
];

// ─── geometry ───────────────────────────────────────────────────────────────

/**
 * The canvas every community-tour clip renders at.
 *
 * 1080x1576 (aspect 0.685), NOT 9:16. The tour's only playback surface is the
 * feed's community card, and that card is 0.685 on every iPhone from the 13
 * mini up — `(screenW - GUTTER*2) / (stage * CARD_FRAME_RATIO)`, which lands
 * between 0.672 and 0.689 across the lineup (2026-08-23: the card grew — gutter
 * 37→16, ratio 0.73→0.83 — and the two moved TOGETHER precisely so this number
 * would not; it was 0.679-0.693 before). `CommunityFace` plays it with
 * `fit="cover"` unconditionally, so any mismatch is cropped away, not
 * letterboxed: a 9:16 render lost 17% of its height on an iPhone 15 and 38% on
 * an SE, and the place label — drawn at 86% height — was cropped or buried
 * under the card's own name/chips/Explore chrome on every device.
 *
 * The SE alone stays off this number (0.796, because its short screen gives the
 * fixed 128pt of chrome a much larger share); it crops 14% instead of ~1%,
 * which the title-safe label position below absorbs.
 *
 * Outpainting still targets 9:16 on purpose — a taller source is a superset of
 * this canvas, so the reframes produced before this change stay valid and the
 * spend is not repeated.
 */
export const CANVAS_W = 1080;
export const CANVAS_H = 1576;

/**
 * The canvas aspect, DERIVED. Everything that measures "how much does the
 * canvas throw away" reads this — a hardcoded 9/16 here would compute the
 * engine split against a frame the film is not rendered in.
 */
export const TARGET_ASPECT = CANVAS_W / CANVAS_H;

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

/** Too soft for a full-frame clip, whatever the camera move. */
export function isTooLowRes(widthPx: number, heightPx: number): boolean {
  return upscaleFactor(widthPx, heightPx) > MAX_UPSCALE;
}

/**
 * Fraction of the photo the canvas crops away.
 *
 * Known values, restated for the 0.685 canvas (the spec §4.1 figures were
 * 9:16): 3024x4032 → 0.086, 3456x2304 → 0.543, 2000x947 → 0.676.
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
export interface Unit {
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

/**
 * Amenity order for the community act: the walk a visitor would actually take.
 *
 * Lower sorts earlier. Matched against the POI name, so it survives the
 * naming convention the ingest uses ("Aberdeen Pool", "Aberdeen Tennis
 * Courts"). Anything unrecognised lands in the middle rather than at either
 * end — an unknown amenity is not automatically the finale.
 */
const AMENITY_SEQUENCE: Array<[RegExp, number]> = [
  [/\b(entrance|gate|sign|grounds|street|entry)\b/i, 0],
  [/\b(clubhouse|club house|amenity cent(er|re)|lodge)\b/i, 1],
  [/\b(pool|swim|aquatic|splash)\b/i, 2],
  [/\b(tennis|pickleball|court|basketball)\b/i, 3],
  [/\b(playground|park|trail|green|lake|pond)\b/i, 4],
  [/\b(gym|fitness|clubroom)\b/i, 5],
];
const AMENITY_SEQUENCE_DEFAULT = 3.5;

export function amenityRank(poiName: string): number {
  for (const [pattern, rank] of AMENITY_SEQUENCE) {
    if (pattern.test(poiName)) return rank;
  }
  return AMENITY_SEQUENCE_DEFAULT;
}

/**
 * Where a group of community clips sits in the walk-through.
 *
 * `amenityOrder` when the photo carries a classified amenity — it is a verdict
 * on the pixels, so it beats a regex over a name someone typed into the ingest
 * panel. `amenityRank` remains for the per-amenity POIs the ingest still
 * creates ("Aberdeen Tennis Courts"), which carry no amenity of their own.
 */
function groupRank(u: Unit): number {
  const amenity = u.entries[0]!.meta.amenity;
  return amenity ? amenityOrder(amenity) : amenityRank(u.entries[0]!.meta.poi_name);
}

/**
 * One amenity at a time, in walk-through order.
 *
 * Owner 2026-08-19: "why do we start with pool, then go back to pool again and
 * again". Sorting the act by time of day interleaved five pool clips with the
 * clubhouse and the courts, which reads as a slideshow rather than a tour —
 * and makes narration impossible to write, because a line about the pool has
 * no contiguous stretch of pool to sit over. Every clip of one POI now plays
 * together, and the POIs run entrance → clubhouse → pool → courts → green
 * space, the order someone shown around would see them in.
 */
function orderCommunityAct(units: Unit[]): Unit[] {
  if (units.length === 0) return [];

  // The AMENITY, not the POI. A community whose site has a page per amenity
  // gets one POI each and the two keys agree; a community whose photos all
  // arrived from one gallery page has a single POI carrying the pool, the
  // clubhouse and the courts, and grouping on `poi_id` there collapses the
  // whole act into one block sorted by nothing in particular. See
  // `amenity.ts`.
  const groupKey = (u: Unit) => u.entries[0]!.meta.amenity ?? u.entries[0]!.meta.poi_id;
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const key = groupKey(u);
    const arr = groups.get(key) ?? [];
    arr.push(u);
    groups.set(key, arr);
  }

  // Inside one amenity: the widest, most inviting frame introduces it, then
  // the rest by time of day. That is the Curator's own definition of
  // 'establishing' — "introduces a POI at wide framing".
  const leadRank = (u: Unit): number => {
    if (u.role === 'opener') return 0;
    if (u.role === 'establishing') return 1;
    return 2;
  };
  const orderWithin = (arr: Unit[]): Unit[] => {
    const [lead, ...rest] = [...arr].sort(
      (a, b) =>
        leadRank(a) - leadRank(b) || b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)),
    );
    const body = rest.sort(
      (a, b) => a.time - b.time || b.emotion - a.emotion || unitId(a).localeCompare(unitId(b)),
    );
    return lead ? [lead, ...body] : body;
  };

  return [...groups.values()]
    .map(orderWithin)
    .sort((a, b) => {
      const ra = groupRank(a[0]!);
      const rb = groupRank(b[0]!);
      // Emotion breaks a tie between two unrecognised amenities so the order
      // stays deterministic without being arbitrary.
      return ra - rb || b[0]!.emotion - a[0]!.emotion || unitId(a[0]!).localeCompare(unitId(b[0]!));
    })
    .flat();
}

/**
 * Opener, the day in order, closer — one POI at a time, then spread.
 *
 * Grouped by POI for the same reason the community act is (owner 2026-08-19,
 * on narration needing something contiguous to sit over). Removing the temple
 * from Aberdeen changed the bucket mix enough that the old per-clip spread
 * started splitting Sharon Elementary and Patel Brothers across two positions
 * each — the same defect, one act over.
 */
function orderSurroundingsAct(units: Unit[]): Unit[] {
  if (units.length === 0) return [];

  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const poiId = u.entries[0]!.meta.poi_id;
    const arr = groups.get(poiId) ?? [];
    arr.push(u);
    groups.set(poiId, arr);
  }

  // Inside one POI: whichever frame introduces it leads. The Curator's single
  // 'opener' outranks a plain establishing shot — otherwise a POI that holds
  // the tour's opener can bury it behind its own second photo.
  const withinRank = (u: Unit): number =>
    u.role === 'opener' ? 0 : u.role === 'establishing' ? 1 : 2;
  const blocks = [...groups.values()].map((arr) =>
    [...arr].sort(
      (a, b) =>
        withinRank(a) - withinRank(b) ||
        a.time - b.time ||
        b.emotion - a.emotion ||
        unitId(a).localeCompare(unitId(b)),
    ),
  );

  const holds = (block: Unit[], role: 'opener' | 'closer') => block.some((u) => u.role === role);
  const earliest = (block: Unit[]) => Math.min(...block.map((u) => u.time));
  const bestEmotion = (block: Unit[]) => Math.max(...block.map((u) => u.emotion));

  const openerBlock = blocks
    .filter((b) => holds(b, 'opener'))
    .sort((a, b) => bestEmotion(b) - bestEmotion(a))[0];
  const closerBlock = blocks
    .filter((b) => holds(b, 'closer') && b !== openerBlock)
    .sort((a, b) => bestEmotion(b) - bestEmotion(a))[0];
  const middle = blocks
    .filter((b) => b !== openerBlock && b !== closerBlock)
    .sort(
      (a, b) =>
        earliest(a) - earliest(b) ||
        bestEmotion(b) - bestEmotion(a) ||
        unitId(a[0]!).localeCompare(unitId(b[0]!)),
    );

  const ordered = [
    ...(openerBlock ? [openerBlock] : []),
    ...middle,
    ...(closerBlock ? [closerBlock] : []),
  ];
  return groupBuckets(ordered, openerBlock, closerBlock).flat();
}

/** elementary → middle → high, the order a family moves through them. */
const SCHOOL_TIER = [/\belementary\b|\bprimary\b/i, /\bmiddle\b|\bjunior\b/i, /\bhigh\b/i];

export function schoolTierRank(name: string): number {
  const i = SCHOOL_TIER.findIndex((re) => re.test(name));
  return i === -1 ? SCHOOL_TIER.length : i;
}

/**
 * Blocks of the same bucket run consecutively, as one chapter.
 *
 * This REPLACED a rule that did the exact opposite — `spreadBuckets` pushed
 * same-bucket blocks apart to avoid two restaurants back to back. That reads
 * fine as a wordless reel but it scattered the thing this audience cares most
 * about: Aberdeen's cut ran Sharon Elementary, then a gym, a mall and a
 * library, then Riverwatch Middle five shots later. Owner 2026-08-19: "same
 * group content goes together, for example, elementary/middle/high school
 * should go one by one".
 *
 * It also has to be this way for the voice-over. Narration is written against
 * the running order, so "the three schools" can only be one line if the three
 * schools are actually adjacent.
 *
 * Chapters keep the order their first block already had, so the opener's bucket
 * still leads. The opener and closer blocks are pinned and never move — a
 * closer that shares its bucket with an earlier block stays at the end rather
 * than being pulled into that chapter.
 */
export function groupBuckets(
  ordered: Unit[][],
  openerBlock?: Unit[],
  closerBlock?: Unit[],
): Unit[][] {
  const chapters = new Map<string, Unit[][]>();
  for (const block of ordered) {
    if (block === openerBlock || block === closerBlock) continue;
    const bucket = block[0]!.bucket;
    const chapter = chapters.get(bucket);
    if (chapter) chapter.push(block);
    else chapters.set(bucket, [block]);
  }

  // Each bucket appears once, at the position of its FIRST block, carrying
  // every block of that bucket with it.
  const seen = new Set<string>();
  const rebuilt: Unit[][] = [];
  for (const block of ordered) {
    if (block === openerBlock || block === closerBlock) {
      rebuilt.push(block);
      continue;
    }
    const bucket = block[0]!.bucket;
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    const chapter = chapters.get(bucket) ?? [block];
    if (bucket === 'schools') {
      chapter.sort(
        (a, b) =>
          schoolTierRank(a[0]!.entries[0]!.meta.poi_name ?? '') -
            schoolTierRank(b[0]!.entries[0]!.meta.poi_name ?? '') ||
          unitId(a[0]!).localeCompare(unitId(b[0]!)),
      );
    }
    rebuilt.push(...chapter);
  }
  return rebuilt;
}

// ─── engines ────────────────────────────────────────────────────────────────

/**
 * Any person in frame at all, at any depth.
 *
 * DepthFlow is Depth Anything: a monocular depth estimate driving a parallax
 * warp. It has no notion of a body, so a person straddling a depth discontinuity
 * gets stretched, bent, or smeared into the background as the camera moves —
 * and a warped human is the one artefact a viewer always notices, whatever else
 * the frame is doing. Owner 2026-08-19, as a standing rule: "never use depth
 * anything for any photos with people in it".
 *
 * 'background' counts. The rule is deliberately absolute — the quota below is
 * satisfied from photos without people, or it goes unmet and those clips fall
 * to Ken Burns, which only ever moves a crop window and cannot deform anything.
 */
function hasPeople(e: Entry): boolean {
  return e.annotation.people_prominence !== 'none';
}

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
    ({ e }) => !e.letterbox && !hasPeople(e) && e.overflow <= DEPTHFLOW_MAX_OVERFLOW,
  );
  const chosen = qualifying.slice(0, quota);
  if (chosen.length < quota) {
    for (const cand of byOverflow) {
      if (chosen.length >= quota) break;
      if (chosen.some((c) => c.i === cand.i)) continue;
      if (cand.e.letterbox) continue; // a panorama is never parallaxed
      if (hasPeople(cand.e)) continue; // hard rule — see hasPeople
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
    !hasPeople(ordered[k]!) && // the swap must not smuggle a person into DepthFlow
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
