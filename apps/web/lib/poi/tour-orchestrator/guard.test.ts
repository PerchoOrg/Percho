import { describe, expect, it } from 'vitest';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';
import { guardClips } from './guard';
import { scheduleClips } from './scheduler';
import { SCHOOL_ASSIGNMENT_PATTERNS, stripSchoolAssignment } from './school-language';
import {
  CLAUSE_KEEP_PEOPLE,
  CLAUSE_NO_PEOPLE,
  CLAUSE_RIGID_GEOMETRY,
  CLAUSE_SIGNAGE,
} from './seedance-prompt';
import type { PhotoAnnotation } from './types';

const guarded = (annotations: PhotoAnnotation[] = GOLDEN_ANNOTATIONS) =>
  guardClips(scheduleClips(annotations, GOLDEN_PHOTOS).clips, annotations, GOLDEN_PHOTOS);

describe('guardClips — clause injection', () => {
  it('gives every Seedance clip exactly one people clause plus the signage clause', () => {
    const { clips } = guarded();
    const seedance = clips.filter((c) => c.engine === 'seedance');
    expect(seedance.length).toBeGreaterThan(0);
    for (const c of seedance) {
      const a = GOLDEN_ANNOTATIONS.find((x) => x.photo_id === c.photo_id)!;
      expect(c.constraints).toContain(CLAUSE_SIGNAGE);
      expect(c.constraints).toContain(
        a.people_prominence === 'none' ? CLAUSE_NO_PEOPLE : CLAUSE_KEEP_PEOPLE,
      );
      expect(
        c.constraints.filter((x) => x === CLAUSE_NO_PEOPLE || x === CLAUSE_KEEP_PEOPLE),
      ).toHaveLength(1);
      // Every applicable clause is in the prompt, verbatim.
      for (const clause of c.constraints) expect(c.prompt).toContain(clause);
    }
  });

  it('carries the geometry clause exactly when the frame has rigid geometry', () => {
    const { clips } = guarded();
    for (const c of clips.filter((x) => x.engine === 'seedance')) {
      const a = GOLDEN_ANNOTATIONS.find((x) => x.photo_id === c.photo_id)!;
      expect(c.constraints.includes(CLAUSE_RIGID_GEOMETRY)).toBe(a.has_rigid_geometry);
    }
  });

  it('keeps the stadium off Seedance — its name board is legible', () => {
    // Verified against the image (2026-08-17): "NORCROSS BLUE DEVIL STADIUM"
    // reads clearly across the press box, and a generative model would redraw it.
    const { clips } = guarded();
    const stadium = clips.find((c) => c.photo_id === 'd9973e1e-eb3b-4976-8cd7-db320aee652c')!;
    expect(stadium.engine).not.toBe('seedance');
    expect(stadium.ai_generated).toBe(false);
  });

  it('leaves locally rendered clips without constraints or a prompt', () => {
    const { clips } = guarded();
    for (const c of clips.filter((x) => x.engine !== 'seedance')) {
      expect(c.constraints).toEqual([]);
      expect(c.prompt).toBeNull();
    }
  });

  it('marks AI generation per clip, and only on Seedance', () => {
    const { clips } = guarded();
    for (const c of clips) expect(c.ai_generated).toBe(c.engine === 'seedance');
  });
});

describe('guardClips — downgrades', () => {
  /**
   * The Scheduler already refuses these photos as Seedance candidates, so the
   * only way to reach the Guard's downgrade path is the way production can:
   * an engine set on the clip after scheduling (admin override, hand-edited
   * plan). Force it directly rather than through the Scheduler.
   */
  const forceSeedance = (photoId: string, patch: Partial<PhotoAnnotation>) => {
    const annotations = GOLDEN_ANNOTATIONS.map((a) =>
      a.photo_id === photoId
        ? ({
            ...a,
            has_natural_motion: true,
            motion_hint: 'shoppers passing, banners moving',
            dominant_subject: 'open_space',
            ...patch,
          } as PhotoAnnotation)
        : a,
    );
    const clips = scheduleClips(annotations, GOLDEN_PHOTOS).clips.map((c) =>
      c.photo_id === photoId
        ? { ...c, engine: 'seedance' as const, move: 'drift_in', duration_s: 4.0 }
        : c,
    );
    return { annotations, result: guardClips(clips, annotations, GOLDEN_PHOTOS) };
  };

  it('downgrades a Seedance clip with readable brand signage and leaves a trace', () => {
    const { result } = forceSeedance('6ceb7f5d-0777-49b4-9e72-b03d14f09e5f', {
      has_readable_brand_signage: true,
    });
    const clip = result.clips.find((c) => c.photo_id === '6ceb7f5d-0777-49b4-9e72-b03d14f09e5f')!;
    expect(clip.engine).toBe('kenburns');
    expect(clip.ai_generated).toBe(false);
    expect(clip.prompt).toBeNull();
    expect(
      result.violations.some(
        (v) => v.code === 'seedance_brand_signage_downgrade' && v.photo_id === clip.photo_id,
      ),
    ).toBe(true);
  });

  it('downgrades a Seedance clip with people in the foreground', () => {
    const { result } = forceSeedance('656750e9-a9b3-48a4-bb3b-20ad04277834', {
      has_visible_people: true,
      people_prominence: 'foreground',
      has_readable_brand_signage: false,
    });
    const clip = result.clips.find((c) => c.photo_id === '656750e9-a9b3-48a4-bb3b-20ad04277834')!;
    expect(clip.engine).toBe('kenburns');
    expect(result.violations.some((v) => v.code === 'seedance_foreground_people_downgrade')).toBe(
      true,
    );
  });

  it('re-derives the move after a downgrade so no two neighbours repeat', () => {
    const { result } = forceSeedance('6ceb7f5d-0777-49b4-9e72-b03d14f09e5f', {
      has_readable_brand_signage: true,
    });
    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i]!.move).not.toBe(result.clips[i - 1]!.move);
    }
  });
});

describe('guardClips — school assignment language', () => {
  it('strips the offending sentence from narration and records a violation', () => {
    const annotations = GOLDEN_ANNOTATIONS.map((a) =>
      a.photo_id === 'eb3b553a-030f-4477-a306-ab40c53e1332'
        ? { ...a, vo_line: 'The school sits on the north side. Your kids will attend it.' }
        : a,
    );
    const { clips, violations } = guarded(annotations);
    const clip = clips.find((c) => c.photo_id === 'eb3b553a-030f-4477-a306-ab40c53e1332')!;
    expect(clip.vo_line).toBe('The school sits on the north side.');
    expect(violations.some((v) => v.code === 'vo_school_assignment_stripped')).toBe(true);
  });

  it('leaves compliant location phrasing alone', () => {
    const { clips, violations } = guarded();
    const clip = clips.find((c) => c.photo_id === 'eb3b553a-030f-4477-a306-ab40c53e1332')!;
    expect(clip.vo_line).toContain('sits on the north side');
    expect(violations).toEqual([]);
  });
});

describe('school-language patterns', () => {
  const cases: Array<[string, string]> = [
    ['zoned_for', 'The home is zoned for Simpson Elementary.'],
    ['your_children', 'Your children walk to class in ten minutes.'],
    ['will_attend', 'Buyers here will attend Norcross High School.'],
    ['assigned_to', 'This address is assigned to Pinckneyville Middle.'],
    ['school_district_is', 'The school district is Gwinnett County.'],
    ['feeds_into', 'The neighbourhood feeds into Paul Duke STEM.'],
  ];

  it('has a hitting case for each of the six patterns', () => {
    expect(cases).toHaveLength(SCHOOL_ASSIGNMENT_PATTERNS.length);
    for (const [code, line] of cases) {
      const { text, codes } = stripSchoolAssignment(line);
      expect(codes).toContain(code);
      expect(text).toBe('');
    }
  });

  it('keeps the clean half of a two-sentence line', () => {
    const { text } = stripSchoolAssignment(
      'Norcross High School sits on the north side. It feeds into the district.',
    );
    expect(text).toBe('Norcross High School sits on the north side.');
  });

  it('passes location phrasing untouched', () => {
    const line = 'Norcross High School sits on the north side of the neighbourhood.';
    expect(stripSchoolAssignment(line)).toEqual({ text: line, codes: [] });
  });
});
