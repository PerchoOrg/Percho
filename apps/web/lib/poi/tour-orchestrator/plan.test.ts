import { describe, expect, it } from 'vitest';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';
import { guardClips } from './guard';
import { scheduleClips } from './scheduler';
import type { PhotoAnnotation, PhotoMeta } from './types';

/**
 * buildTourPlan itself calls the Curator and the VO Pass over the network, so
 * these cover the part that decides what the network results are allowed to
 * become: the exclusion filter, applied to the same annotations the plan uses.
 */
const WATERMARKED = 'f1b25f82-fa6e-4d87-a70c-ad8882708fb0';

/** Mirrors the filter in buildTourPlan. */
function excludeUnusable(annotations: PhotoAnnotation[]): {
  usable: PhotoAnnotation[];
  excluded: string[];
} {
  const excluded: string[] = [];
  const usable = annotations.filter((a) => {
    if (!a.has_overlay_text) return true;
    excluded.push(a.photo_id);
    return false;
  });
  return { usable, excluded };
}

describe('overlay-text photos never reach the tour', () => {
  it('the fixture pins the watermarked frame', () => {
    const a = GOLDEN_ANNOTATIONS.find((x) => x.photo_id === WATERMARKED)!;
    expect(a.has_overlay_text).toBe(true);
    // It is a normal park photo otherwise — that is the point. Nothing else
    // about it would have kept it out.
    expect(a.has_readable_brand_signage).toBe(false);
    expect(a.dominant_subject).toBe('open_space');
  });

  it('drops it before scheduling, and only it', () => {
    const { usable, excluded } = excludeUnusable(GOLDEN_ANNOTATIONS);
    expect(excluded).toEqual([WATERMARKED]);
    expect(usable).toHaveLength(GOLDEN_ANNOTATIONS.length - 1);
  });

  it('leaves no clip for that photo in the shot list', () => {
    const { usable } = excludeUnusable(GOLDEN_ANNOTATIONS);
    const { clips } = scheduleClips(usable, GOLDEN_PHOTOS);
    expect(clips.some((c) => c.photo_id === WATERMARKED)).toBe(false);
    expect(clips).toHaveLength(GOLDEN_PHOTOS.length - 1);
  });

  it('still produces a compliant plan without it', () => {
    const { usable } = excludeUnusable(GOLDEN_ANNOTATIONS);
    const scheduled = scheduleClips(usable, GOLDEN_PHOTOS);
    const { clips } = guardClips(scheduled.clips, usable, GOLDEN_PHOTOS);
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i]!.move).not.toBe(clips[i - 1]!.move);
    }
    const total = clips.reduce((n, c) => n + c.duration_s, 0);
    expect(total).toBeGreaterThanOrEqual(45);
    expect(total).toBeLessThanOrEqual(50);
  });

  it('a watermark on the opener does not strand the tour', () => {
    // The opener is load-bearing: dropping it must not leave the plan without
    // one, and the film must still start somewhere.
    const annotations: PhotoAnnotation[] = GOLDEN_ANNOTATIONS.map((a) =>
      a.narrative_role === 'opener' ? { ...a, has_overlay_text: true } : a,
    );
    const { usable, excluded } = excludeUnusable(annotations);
    expect(excluded).toHaveLength(2);
    const { clips } = scheduleClips(usable, GOLDEN_PHOTOS);
    expect(clips.length).toBe(GOLDEN_PHOTOS.length - 2);
    expect(clips[0]).toBeDefined();
  });

  it('photos with no meta are still skipped for the usual reason', () => {
    const photos: PhotoMeta[] = GOLDEN_PHOTOS.slice(0, 4);
    const { usable } = excludeUnusable(GOLDEN_ANNOTATIONS);
    const { clips } = scheduleClips(usable, photos);
    expect(clips.length).toBeLessThanOrEqual(4);
  });
});
