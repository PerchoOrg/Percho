/**
 * Community Tour orchestration layer — shared vocabulary (2026-08-18).
 *
 * Four layers, deliberately not mixed in one LLM call:
 *   Curator   (LLM · VLM)  per-photo semantic annotation — decides nothing
 *   Scheduler (pure)       order + engine + move + duration
 *   Guard     (pure)       compliance hard checks + downgrades
 *   VO Pass   (LLM · text) narration continuity (Phase 3)
 *
 * This file holds the Curator's output contract. The Curator never names an
 * engine, a move, an order, or a duration: every field below describes what a
 * photo IS, and the Scheduler derives the rest from those + the pixel size.
 * That is what makes each field enumerable, verifiable, and comparable against
 * a human annotation pass.
 */

import { z } from 'zod';

export const DOMINANT_SUBJECTS = [
  'nature',
  'building_facade',
  'street_perspective',
  'interior_close',
  'open_space',
  'signage',
] as const;
export type DominantSubject = (typeof DOMINANT_SUBJECTS)[number];

export const PEOPLE_PROMINENCE = ['none', 'background', 'midground', 'foreground'] as const;
export type PeopleProminence = (typeof PEOPLE_PROMINENCE)[number];

export const NARRATIVE_ROLES = ['opener', 'establishing', 'detail', 'closer', 'filler'] as const;
export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];

export const PAIR_ROLES = ['wide', 'close'] as const;
export type PairRole = (typeof PAIR_ROLES)[number];

export const annotationSchema = z.object({
  photo_id: z.string().min(1),
  /** Elements that genuinely move in reality AND are visible in this frame. */
  has_natural_motion: z.boolean(),
  /** 3-10 words naming what moves, or '' when has_natural_motion is false. */
  motion_hint: z.string(),
  dominant_subject: z.enum(DOMINANT_SUBJECTS),
  has_visible_people: z.boolean(),
  people_prominence: z.enum(PEOPLE_PROMINENCE),
  /** Any legible storefront name, logo, or trademark. */
  has_readable_brand_signage: z.boolean(),
  /**
   * Text stamped ONTO the image rather than present in the scene: a camera
   * watermark ("Shot on OnePlus | HASSELBLAD"), a date stamp, a stock-photo
   * mark. Such a photo is dropped from the tour outright — no camera move
   * hides it, and it is someone else's branding on our film.
   */
  has_overlay_text: z.boolean(),
  /** Track lanes, parking stripes, window grids, fence rails, brick coursing. */
  has_rigid_geometry: z.boolean(),
  narrative_role: z.enum(NARRATIVE_ROLES),
  /** 0=dawn 25=morning 50=midday 75=golden hour 85=dusk 100=night. */
  time_of_day: z.number().int().min(0).max(100),
  emotional_weight: z.number().min(0).max(1),
  /** photo_id of the other half of a wide→close pair on the same POI. */
  poi_pair_with: z.string().nullable(),
  pair_role: z.enum(PAIR_ROLES).nullable(),
  /** One narration line, '' when the clip carries none. */
  vo_line: z.string(),
  chip_label: z.string(),
});

export type PhotoAnnotation = z.infer<typeof annotationSchema>;

/** Everything the Scheduler needs that is NOT a semantic judgement. */
export interface PhotoMeta {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  /** Tour bucket of the POI (schools / dining / outdoor / …). */
  bucket: string;
  width_px: number;
  height_px: number;
  /** Vision-tagger description — feeds the Seedance scene clause. */
  description: string;
  /** Editorial POI order from the city-sector research plan. */
  narrative_rank?: number;
}

export type Engine = 'seedance' | 'depthflow' | 'kenburns';

export interface ScheduledClip {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  bucket: string;
  sort_order: number;
  engine: Engine;
  move: string;
  duration_s: number;
  /** Fraction of the photo the 9:16 canvas has to crop away. */
  overflow: number;
  /** Panorama: pad top/bottom instead of cropping 73% of the frame away. */
  letterbox: boolean;
  /** Locked Seedance frame — the natural motion is the only movement. */
  camera_fixed: boolean;
  vo_line: string;
  chip_label: string;
}

/** Non-fatal: the plan is still renderable, but a preference was given up. */
export interface PlanWarning {
  code:
    | 'depthflow_quota_over_threshold'
    | 'depthflow_adjacent_demoted'
    | 'tour_duration_off_target'
    | 'annotation_enum_coerced'
    | 'annotation_role_coerced'
    | 'annotation_pair_unpaired';
  photo_id: string;
  detail: string;
}
