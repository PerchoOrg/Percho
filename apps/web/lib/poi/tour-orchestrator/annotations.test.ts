import { describe, expect, it } from 'vitest';
import { normalizeAnnotations } from './annotations';
import { GOLDEN_ANNOTATIONS } from './fixtures/peachtree-corners';
import { annotationSchema } from './types';

describe('annotationSchema', () => {
  it('accepts every hand annotation in the golden fixture', () => {
    for (const a of GOLDEN_ANNOTATIONS) {
      expect(annotationSchema.safeParse(a).success).toBe(true);
    }
  });
});

describe('normalizeAnnotations', () => {
  const raw = (patch: Record<string, unknown>) => ({
    photo_id: 'p1',
    has_natural_motion: true,
    motion_hint: 'leaves swaying',
    dominant_subject: 'nature',
    has_visible_people: false,
    people_prominence: 'none',
    has_readable_brand_signage: false,
    has_rigid_geometry: false,
    narrative_role: 'establishing',
    time_of_day: 50,
    emotional_weight: 0.5,
    poi_pair_with: null,
    pair_role: null,
    vo_line: 'A line.',
    chip_label: 'Chip',
    ...patch,
  });

  it('passes a clean batch through unchanged', () => {
    const { annotations, warnings } = normalizeAnnotations(GOLDEN_ANNOTATIONS);
    expect(warnings).toEqual([]);
    expect(annotations).toEqual(GOLDEN_ANNOTATIONS);
  });

  it('coerces an out-of-range enum to the value Seedance rejects', () => {
    const { annotations, warnings } = normalizeAnnotations([
      raw({ dominant_subject: 'drone_shot', people_prominence: 'crowd' }),
    ]);
    expect(annotations[0]!.dominant_subject).toBe('interior_close');
    expect(annotations[0]!.people_prominence).toBe('foreground');
    expect(warnings.filter((w) => w.code === 'annotation_enum_coerced')).toHaveLength(2);
  });

  it('keeps one opener and one closer, demoting the rest', () => {
    const { annotations, warnings } = normalizeAnnotations([
      raw({ photo_id: 'a', narrative_role: 'opener', emotional_weight: 0.4 }),
      raw({ photo_id: 'b', narrative_role: 'opener', emotional_weight: 0.9 }),
      raw({ photo_id: 'c', narrative_role: 'closer', emotional_weight: 0.8 }),
      raw({ photo_id: 'd', narrative_role: 'closer', emotional_weight: 0.2 }),
    ]);
    expect(annotations.filter((a) => a.narrative_role === 'opener')).toHaveLength(1);
    expect(annotations.filter((a) => a.narrative_role === 'closer')).toHaveLength(1);
    expect(annotations.find((a) => a.photo_id === 'b')!.narrative_role).toBe('opener');
    expect(annotations.find((a) => a.photo_id === 'c')!.narrative_role).toBe('closer');
    expect(warnings.filter((w) => w.code === 'annotation_role_coerced')).toHaveLength(2);
  });

  it('unpairs a one-sided pair reference', () => {
    const { annotations, warnings } = normalizeAnnotations([
      raw({ photo_id: 'a', poi_pair_with: 'b', pair_role: 'wide' }),
      raw({ photo_id: 'b', poi_pair_with: null, pair_role: null }),
    ]);
    expect(annotations[0]!.poi_pair_with).toBeNull();
    expect(annotations[0]!.pair_role).toBeNull();
    expect(warnings.some((w) => w.code === 'annotation_pair_unpaired')).toBe(true);
  });

  it('unpairs when both halves claim the same pair role', () => {
    const { annotations } = normalizeAnnotations([
      raw({ photo_id: 'a', poi_pair_with: 'b', pair_role: 'wide' }),
      raw({ photo_id: 'b', poi_pair_with: 'a', pair_role: 'wide' }),
    ]);
    expect(annotations.every((a) => a.poi_pair_with === null)).toBe(true);
  });

  it('keeps a mutual wide/close pair', () => {
    const { annotations, warnings } = normalizeAnnotations([
      raw({ photo_id: 'a', poi_pair_with: 'b', pair_role: 'wide' }),
      raw({ photo_id: 'b', poi_pair_with: 'a', pair_role: 'close' }),
    ]);
    expect(annotations[0]!.poi_pair_with).toBe('b');
    expect(warnings).toEqual([]);
  });

  it('clamps numbers and drops rows with no photo id', () => {
    const { annotations } = normalizeAnnotations([
      raw({ time_of_day: 900, emotional_weight: 4 }),
      raw({ photo_id: '' }),
      { nonsense: true },
    ]);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]!.time_of_day).toBe(100);
    expect(annotations[0]!.emotional_weight).toBe(1);
  });
});
