/**
 * The whole orchestration in one call: Curator → Scheduler → Guard → VO Pass.
 *
 * The route hands this the photos it selected and gets back the final shot
 * list plus everything review needs to judge it — coercion warnings, plan
 * warnings, compliance violations, and the narration pace. Nothing is silent.
 */

import { type CuratorPhoto, curateBatch } from './curator';
import { type GuardViolation, type GuardedClip, guardClips } from './guard';
import { scheduleClips } from './scheduler';
import type { PhotoAnnotation, PhotoMeta, PlanWarning } from './types';
import {
  type NarrationStats,
  type VoViolation,
  assertNoSchoolAssignment,
  narrationStats,
  runVoPass,
} from './vo-pass';

/** A selected photo: everything the Curator and the Scheduler each need. */
export interface TourPlanPhoto extends PhotoMeta {
  bytes: Uint8Array;
  mime_type: string;
}

/** One clip as persisted in step_results.photos.shots / ordered_clips. */
export interface TourShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  bucket: string;
  sort_order: number;
  engine: 'seedance' | 'depthflow' | 'kenburns';
  move: string;
  duration_s: number;
  /** Seedance only — the assembled prompt with its mandatory clauses. */
  prompt: string | null;
  ai_generated: boolean;
  vo_line: string;
  chip_label: string;
  overflow: number;
  letterbox: boolean;
  camera_fixed: boolean;
}

/** A photo the Curator saw and the plan refuses to use at all. */
export interface ExcludedPhoto {
  photo_id: string;
  reason: string;
}

export interface TourPlan {
  shots: TourShot[];
  annotations: PhotoAnnotation[];
  /** Photos kept out of the tour entirely, with the reason. */
  excluded: ExcludedPhoto[];
  warnings: PlanWarning[];
  violations: Array<GuardViolation | VoViolation>;
  narration: NarrationStats;
  curator: {
    model: string;
    attempts: number;
    annotated: number;
    missing: string[];
    unknown: string[];
  };
  vo: { ok: boolean; error?: string };
}

function toShot(clip: GuardedClip): TourShot {
  return {
    photo_id: clip.photo_id,
    poi_id: clip.poi_id,
    poi_name: clip.poi_name,
    bucket: clip.bucket,
    sort_order: clip.sort_order,
    engine: clip.engine,
    move: clip.move,
    duration_s: clip.duration_s,
    prompt: clip.prompt,
    ai_generated: clip.ai_generated,
    vo_line: clip.vo_line,
    chip_label: clip.chip_label,
    overflow: clip.overflow,
    letterbox: clip.letterbox,
    camera_fixed: clip.camera_fixed,
  };
}

/**
 * Plan a tour from the selected photos.
 *
 * Throws only if school-assignment phrasing survives to the end — that is a
 * compliance failure, and shipping the tour anyway is worse than failing the
 * step. Everything else degrades: a VO Pass that fails leaves the Curator's
 * draft lines, which are already compliant.
 */
export async function buildTourPlan(photos: TourPlanPhoto[]): Promise<TourPlan> {
  const curatorPhotos: CuratorPhoto[] = photos.map((p) => ({
    photo_id: p.photo_id,
    poi_name: p.poi_name,
    bucket: p.bucket,
    width_px: p.width_px,
    height_px: p.height_px,
    bytes: p.bytes,
    mime_type: p.mime_type,
  }));
  const meta: PhotoMeta[] = photos.map(({ bytes: _bytes, mime_type: _mime, ...rest }) => rest);

  const curated = await curateBatch(curatorPhotos);

  // Text stamped onto the image — a camera watermark, a date stamp — is not a
  // rendering problem to be worked around, it is a photo we cannot use. No
  // camera move hides it, and it puts another company's branding on the film.
  // Dropped before scheduling so it does not consume a slot, skew the DepthFlow
  // quota, or take up seconds of the running time (owner 2026-08-17, on a
  // "Shot on OnePlus | HASSELBLAD" frame that reached the tour).
  const excluded: ExcludedPhoto[] = [];
  const usable = curated.annotations.filter((a) => {
    if (!a.has_overlay_text) return true;
    excluded.push({ photo_id: a.photo_id, reason: 'overlay text (watermark / date stamp)' });
    return false;
  });

  const scheduled = scheduleClips(usable, meta);
  const guarded = guardClips(scheduled.clips, usable, meta);
  const vo = await runVoPass(guarded.clips);

  assertNoSchoolAssignment(vo.clips);

  return {
    shots: vo.clips.map(toShot),
    annotations: curated.annotations,
    excluded,
    warnings: [...curated.warnings, ...scheduled.warnings],
    violations: [...guarded.violations, ...vo.violations],
    narration: narrationStats(vo.clips),
    curator: {
      model: curated.model,
      attempts: curated.attempts,
      annotated: curated.annotations.length,
      missing: curated.missing,
      unknown: curated.unknown,
    },
    vo: { ok: vo.ok, error: vo.error },
  };
}
