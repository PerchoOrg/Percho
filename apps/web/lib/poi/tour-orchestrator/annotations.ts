/**
 * Curator output validation (pure).
 *
 * The Curator is an LLM, so its output is untrusted: enums drift, the
 * "at most one opener / one closer" instruction gets ignored on long batches,
 * and pair references come back one-sided. None of that is worth a retry — a
 * conservative coercion plus a warning is cheaper and keeps the batch usable.
 *
 * Coercions are deliberately biased toward the safe side: an unreadable
 * subject or people field lands on the value that makes the photo INELIGIBLE
 * for Seedance, never the one that lets it through.
 */

import {
  DOMINANT_SUBJECTS,
  NARRATIVE_ROLES,
  PAIR_ROLES,
  PEOPLE_PROMINENCE,
  type PhotoAnnotation,
  type PlanWarning,
} from './types';

/** Unknown subject → the value the Seedance filter always rejects. */
const SUBJECT_FALLBACK = 'interior_close';
/** Unknown people prominence → the value that forces a Seedance downgrade. */
const PEOPLE_FALLBACK = 'foreground';

function coerceEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
  photoId: string,
  warnings: PlanWarning[],
): T {
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) return raw as T;
  warnings.push({
    code: 'annotation_enum_coerced',
    photo_id: photoId,
    detail: `${field}=${JSON.stringify(raw)} not in enum → ${fallback}`,
  });
  return fallback;
}

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, n));
}

function asBool(raw: unknown): boolean {
  return raw === true;
}

function asString(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

/**
 * Coerce a raw Curator batch into annotations the Scheduler can trust.
 *
 * Rules (spec §6):
 *  - enum out of range        → conservative fallback + warning
 *  - >1 opener or >1 closer   → extras become 'establishing' + warning
 *                               (the one kept is the highest emotional_weight)
 *  - one-sided pair reference → both sides nulled + warning
 */
export function normalizeAnnotations(raw: unknown[]): {
  annotations: PhotoAnnotation[];
  warnings: PlanWarning[];
} {
  const warnings: PlanWarning[] = [];
  const annotations: PhotoAnnotation[] = [];

  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const photoId = asString(o.photo_id);
    if (!photoId) continue;
    annotations.push({
      photo_id: photoId,
      has_natural_motion: asBool(o.has_natural_motion),
      motion_hint: asString(o.motion_hint).trim(),
      dominant_subject: coerceEnum(
        o.dominant_subject,
        DOMINANT_SUBJECTS,
        SUBJECT_FALLBACK,
        'dominant_subject',
        photoId,
        warnings,
      ),
      has_visible_people: asBool(o.has_visible_people),
      people_prominence: coerceEnum(
        o.people_prominence,
        PEOPLE_PROMINENCE,
        PEOPLE_FALLBACK,
        'people_prominence',
        photoId,
        warnings,
      ),
      has_readable_brand_signage: asBool(o.has_readable_brand_signage),
      has_overlay_text: asBool(o.has_overlay_text),
      has_rigid_geometry: asBool(o.has_rigid_geometry),
      narrative_role: coerceEnum(
        o.narrative_role,
        NARRATIVE_ROLES,
        'establishing',
        'narrative_role',
        photoId,
        warnings,
      ),
      time_of_day: Math.round(clampNumber(o.time_of_day, 0, 100, 50)),
      emotional_weight: clampNumber(o.emotional_weight, 0, 1, 0.5),
      poi_pair_with:
        typeof o.poi_pair_with === 'string' && o.poi_pair_with ? o.poi_pair_with : null,
      pair_role:
        typeof o.pair_role === 'string' && (PAIR_ROLES as readonly string[]).includes(o.pair_role)
          ? (o.pair_role as PhotoAnnotation['pair_role'])
          : null,
      vo_line: asString(o.vo_line).trim(),
      chip_label: asString(o.chip_label).trim(),
    });
  }

  // ── at most one opener, at most one closer ──────────────────────────────
  for (const role of ['opener', 'closer'] as const) {
    const held = annotations.filter((a) => a.narrative_role === role);
    if (held.length <= 1) continue;
    // Keep the strongest frame; photo_id breaks ties so the result is stable.
    const keep = [...held].sort(
      (a, b) => b.emotional_weight - a.emotional_weight || a.photo_id.localeCompare(b.photo_id),
    )[0]!;
    for (const a of held) {
      if (a.photo_id === keep.photo_id) continue;
      a.narrative_role = 'establishing';
      warnings.push({
        code: 'annotation_role_coerced',
        photo_id: a.photo_id,
        detail: `${held.length} ${role}s in batch → establishing (kept ${keep.photo_id})`,
      });
    }
  }

  // ── pairs must reference each other ─────────────────────────────────────
  const byId = new Map(annotations.map((a) => [a.photo_id, a]));
  for (const a of annotations) {
    if (!a.poi_pair_with) continue;
    const other = byId.get(a.poi_pair_with);
    const mutual = other?.poi_pair_with === a.photo_id;
    const roled =
      a.pair_role !== null && other?.pair_role !== null && a.pair_role !== other?.pair_role;
    if (mutual && roled) continue;
    warnings.push({
      code: 'annotation_pair_unpaired',
      photo_id: a.photo_id,
      detail: `pair with ${a.poi_pair_with} is not mutual/complementary → unpaired`,
    });
    a.poi_pair_with = null;
    a.pair_role = null;
  }

  return { annotations, warnings };
}
