/**
 * Guard — compliance hard checks and downgrades. PURE.
 *
 * These are not suggestions. Every rule either rewrites the clip or refuses
 * it, and every rewrite leaves a violation record: a silent downgrade gives
 * review nothing to judge.
 *
 * The Scheduler already excludes brand signage and foreground people from the
 * Seedance candidate set, so in the normal path rules 1 and 5 fire on nothing.
 * They stay because the engine can also arrive from an admin override or a
 * hand-edited plan, and that path must not be the one without checks.
 *
 * The people rules are a conservative default, not a legal conclusion. Real
 * estate advertising is bound by FHA §804(c), and a generative model deciding
 * who appears in thousands of neighbourhood clips is not a decision this code
 * gets to make. Until counsel says otherwise: never invent a person.
 */

import { durationFor, moveFor } from './scheduler';
import { stripSchoolAssignment } from './school-language';
import {
  CLAUSE_KEEP_PEOPLE,
  CLAUSE_NO_PEOPLE,
  CLAUSE_RIGID_GEOMETRY,
  CLAUSE_SIGNAGE,
  buildSeedancePrompt,
} from './seedance-prompt';
import type { PhotoAnnotation, PhotoMeta, ScheduledClip } from './types';

export interface GuardedClip extends ScheduledClip {
  /** Verbatim mandatory clauses that apply to this clip ([] off Seedance). */
  constraints: string[];
  /** Full Seedance prompt, null for locally rendered clips. */
  prompt: string | null;
  /** Per-clip AI-generation disclosure — persisted, not derived at render. */
  ai_generated: boolean;
}

export interface GuardViolation {
  code:
    | 'seedance_brand_signage_downgrade'
    | 'seedance_foreground_people_downgrade'
    | 'vo_school_assignment_stripped';
  photo_id: string;
  detail: string;
}

export interface GuardResult {
  clips: GuardedClip[];
  violations: GuardViolation[];
}

/** Clauses a Seedance clip must carry, given what the Curator saw in it. */
export function constraintsFor(annotation: PhotoAnnotation): string[] {
  const clauses: string[] = [];
  clauses.push(annotation.people_prominence === 'none' ? CLAUSE_NO_PEOPLE : CLAUSE_KEEP_PEOPLE);
  if (annotation.has_rigid_geometry) clauses.push(CLAUSE_RIGID_GEOMETRY);
  clauses.push(CLAUSE_SIGNAGE);
  return clauses;
}

export function guardClips(
  clips: ScheduledClip[],
  annotations: PhotoAnnotation[],
  photos: PhotoMeta[],
): GuardResult {
  const annotationById = new Map(annotations.map((a) => [a.photo_id, a]));
  const metaById = new Map(photos.map((p) => [p.photo_id, p]));
  const violations: GuardViolation[] = [];
  const out: GuardedClip[] = [];

  for (const clip of clips) {
    const annotation = annotationById.get(clip.photo_id);
    const meta = metaById.get(clip.photo_id);
    if (!annotation || !meta) continue;

    let engine = clip.engine;

    if (engine === 'seedance' && annotation.has_readable_brand_signage) {
      engine = 'kenburns';
      violations.push({
        code: 'seedance_brand_signage_downgrade',
        photo_id: clip.photo_id,
        detail: 'readable brand signage in frame — Seedance may redraw the logo',
      });
    }
    if (engine === 'seedance' && annotation.people_prominence === 'foreground') {
      engine = 'kenburns';
      violations.push({
        code: 'seedance_foreground_people_downgrade',
        photo_id: clip.photo_id,
        detail: 'people in the foreground — no generated likenesses',
      });
    }

    const { text: voLine, codes } = stripSchoolAssignment(clip.vo_line);
    if (codes.length > 0) {
      violations.push({
        code: 'vo_school_assignment_stripped',
        photo_id: clip.photo_id,
        detail: `school assignment phrasing (${codes.join(', ')}) stripped from narration`,
      });
    }

    const downgraded = engine !== clip.engine;
    const previousMove = out.length > 0 ? out[out.length - 1]!.move : null;
    const move = downgraded
      ? moveFor(
          'kenburns',
          annotation.dominant_subject,
          clip.photo_id,
          previousMove,
          clip.letterbox,
        )
      : clip.move;
    const duration = downgraded
      ? durationFor(annotation.emotional_weight, meta.width_px, meta.height_px, engine)
      : clip.duration_s;

    const constraints = engine === 'seedance' ? constraintsFor(annotation) : [];
    const prompt =
      engine === 'seedance'
        ? buildSeedancePrompt({
            photoId: clip.photo_id,
            poiName: meta.poi_name,
            description: meta.description,
            motionHint: annotation.motion_hint,
            dominantSubject: annotation.dominant_subject,
            move,
            constraints,
          })
        : null;

    out.push({
      ...clip,
      engine,
      move,
      duration_s: duration,
      camera_fixed: engine === 'seedance' && move === 'camera_fixed',
      vo_line: voLine,
      constraints,
      prompt,
      ai_generated: engine === 'seedance',
    });
  }

  // A downgrade rewrites one move and can collide with the next clip's, which
  // was picked against the move that no longer exists.
  for (let i = 1; i < out.length; i++) {
    const clip = out[i]!;
    if (clip.engine === 'seedance') continue;
    if (clip.move !== out[i - 1]!.move) continue;
    const annotation = annotationById.get(clip.photo_id)!;
    clip.move = moveFor(
      clip.engine,
      annotation.dominant_subject,
      clip.photo_id,
      out[i - 1]!.move,
      clip.letterbox,
    );
  }

  return { clips: out, violations };
}
