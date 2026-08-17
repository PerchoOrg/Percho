import { describe, expect, it } from 'vitest';
import { GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS } from './fixtures/peachtree-corners';
import {
  DEPTHFLOW_MAX_OVERFLOW,
  DEPTHFLOW_MOVES,
  DURATION_MAX,
  DURATION_MIN,
  KEN_BURNS_MOVES,
  SEEDANCE_MAX_CLIPS,
  SEEDANCE_MIN_DURATION,
  depthflowAmplitude,
  depthflowQuota,
  durationFor,
  isPanorama,
  overflow,
  scheduleClips,
} from './scheduler';
import type { PhotoAnnotation, PhotoMeta } from './types';

const plan = () => scheduleClips(GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS);

describe('overflow', () => {
  it('matches the three known values exactly', () => {
    expect(overflow(3024, 4032)).toBeCloseTo(0.25, 10);
    expect(overflow(3456, 2304)).toBeCloseTo(0.625, 10);
    expect(overflow(2000, 947)).toBeCloseTo(0.734, 3);
  });

  it('is zero on an exact 9:16 frame and never negative', () => {
    expect(overflow(1080, 1920)).toBeCloseTo(0, 10);
    expect(overflow(0, 0)).toBe(0);
  });

  it('puts 3:4 portrait and 4:3 landscape on opposite sides of the threshold', () => {
    expect(overflow(3024, 4032)).toBeLessThan(DEPTHFLOW_MAX_OVERFLOW);
    expect(overflow(4032, 3024)).toBeGreaterThan(DEPTHFLOW_MAX_OVERFLOW);
  });
});

describe('durationFor', () => {
  it('stays inside [2.0, 4.5]', () => {
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      const d = durationFor(w, 3024, 4032, 'kenburns');
      expect(d).toBeGreaterThanOrEqual(DURATION_MIN);
      expect(d).toBeLessThanOrEqual(DURATION_MAX);
    }
  });

  it('shortens low resolution to the floor whatever the emotional weight', () => {
    expect(durationFor(0.4, 680, 497, 'kenburns')).toBe(2.0);
    expect(durationFor(1.0, 680, 497, 'kenburns')).toBe(2.0);
  });

  it('gives Seedance the provider floor of 4s', () => {
    expect(durationFor(0.1, 3024, 4032, 'seedance')).toBe(SEEDANCE_MIN_DURATION);
    expect(durationFor(0.5, 3024, 4032, 'kenburns')).toBe(3.0);
  });
});

describe('depthflowQuota', () => {
  it('targets 40% and stays within [1/3, 1/2]', () => {
    for (let n = 4; n <= 40; n++) {
      const q = depthflowQuota(n);
      expect(q / n).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
      expect(q / n).toBeLessThanOrEqual(1 / 2 + 1e-9);
    }
    expect(depthflowQuota(10)).toBe(4);
  });

  it('never drops below 2 on a short tour', () => {
    expect(depthflowQuota(3)).toBe(2);
    expect(depthflowQuota(0)).toBe(0);
  });
});

describe('depthflowAmplitude', () => {
  it('falls with the crop and floors at 0.25', () => {
    expect(depthflowAmplitude(0.25)).toBeCloseTo(0.75, 10);
    expect(depthflowAmplitude(0.9)).toBe(0.25);
  });
});

describe('scheduleClips — golden fixture', () => {
  it('is deterministic across 100 runs', () => {
    const first = JSON.stringify(plan());
    for (let i = 0; i < 99; i++) {
      expect(JSON.stringify(scheduleClips(GOLDEN_ANNOTATIONS, GOLDEN_PHOTOS))).toBe(first);
    }
  });

  it('keeps every photo and numbers the order', () => {
    const { clips } = plan();
    expect(clips).toHaveLength(GOLDEN_PHOTOS.length);
    expect(clips.map((c) => c.sort_order)).toEqual(clips.map((_, i) => i));
  });

  it('opens with the opener and closes with the closer', () => {
    const { clips } = plan();
    const roleOf = (id: string) =>
      GOLDEN_ANNOTATIONS.find((a) => a.photo_id === id)!.narrative_role;
    expect(roleOf(clips[0]!.photo_id)).toBe('opener');
    expect(roleOf(clips[clips.length - 1]!.photo_id)).toBe('closer');
  });

  it('keeps a wide→close pair adjacent and in order', () => {
    const { clips } = plan();
    for (const a of GOLDEN_ANNOTATIONS) {
      if (!a.poi_pair_with || a.pair_role !== 'wide') continue;
      const wide = clips.findIndex((c) => c.photo_id === a.photo_id);
      const close = clips.findIndex((c) => c.photo_id === a.poi_pair_with);
      expect(close).toBe(wide + 1);
    }
  });

  it('caps Seedance at the cost gate and only on eligible photos', () => {
    const { clips } = plan();
    const seedance = clips.filter((c) => c.engine === 'seedance');
    expect(seedance.length).toBeLessThanOrEqual(SEEDANCE_MAX_CLIPS);
    for (const c of seedance) {
      const a = GOLDEN_ANNOTATIONS.find((x) => x.photo_id === c.photo_id)!;
      expect(a.has_natural_motion).toBe(true);
      expect(a.has_readable_brand_signage).toBe(false);
      expect(a.people_prominence).not.toBe('foreground');
      expect(['nature', 'open_space']).toContain(a.dominant_subject);
      expect(c.letterbox).toBe(false);
    }
  });

  it('holds DepthFlow to [1/3, 1/2] of the non-Seedance pool, never adjacent', () => {
    const { clips } = plan();
    const pool = clips.filter((c) => c.engine !== 'seedance');
    const df = pool.filter((c) => c.engine === 'depthflow');
    expect(df.length / pool.length).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    expect(df.length / pool.length).toBeLessThanOrEqual(1 / 2 + 1e-9);
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i]!.engine === 'depthflow' && clips[i - 1]!.engine === 'depthflow').toBe(false);
    }
  });

  it('never repeats a move on adjacent clips', () => {
    const { clips } = plan();
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i]!.move).not.toBe(clips[i - 1]!.move);
    }
  });

  it('draws moves from the engine catalogue only', () => {
    const { clips } = plan();
    for (const c of clips) {
      if (c.letterbox) {
        expect(['pan_lr', 'pan_rl']).toContain(c.move);
      } else if (c.engine === 'depthflow') {
        expect(DEPTHFLOW_MOVES as readonly string[]).toContain(c.move);
      } else if (c.engine === 'kenburns') {
        expect(KEN_BURNS_MOVES as readonly string[]).toContain(c.move);
      }
    }
    // The two moves the owner rejected on 2026-08-09 stay rejected.
    expect(DEPTHFLOW_MOVES as readonly string[]).not.toContain('orbit_to_subject');
    expect(DEPTHFLOW_MOVES as readonly string[]).not.toContain('rack_focus');
  });

  it('never runs one bucket for more than 2 consecutive clips', () => {
    const { clips } = plan();
    let run = 1;
    for (let i = 1; i < clips.length; i++) {
      run = clips[i]!.bucket === clips[i - 1]!.bucket ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
    }
  });

  it('keeps every duration inside [2.0, 4.5]', () => {
    const { clips } = plan();
    for (const c of clips) {
      expect(c.duration_s).toBeGreaterThanOrEqual(DURATION_MIN);
      expect(c.duration_s).toBeLessThanOrEqual(DURATION_MAX);
      if (c.engine === 'seedance')
        expect(c.duration_s).toBeGreaterThanOrEqual(SEEDANCE_MIN_DURATION);
    }
  });

  it('letterboxes the panorama instead of cropping 73% away', () => {
    const { clips } = plan();
    const pano = clips.find((c) => c.photo_id === 'caac3754-a837-4395-8506-55c7bb50b7b6')!;
    expect(isPanorama(2000, 947)).toBe(true);
    expect(pano.letterbox).toBe(true);
    expect(pano.engine).toBe('kenburns');
    expect(['pan_lr', 'pan_rl']).toContain(pano.move);
  });

  it('warns once: the quota needs a 4th DepthFlow and only 3 qualify', () => {
    // Seedance takes one of the four low-overflow portraits, leaving 3 under
    // the threshold in a pool of 10 whose 1/3 floor is 4. The quota wins and
    // says so — the threshold is the preference, not the constraint.
    const { warnings } = plan();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('depthflow_quota_over_threshold');
  });
});

describe('scheduleClips — degenerate inputs', () => {
  it('fills the DepthFlow quota past the threshold and says so', () => {
    // Every photo 4:3 landscape → overflow 0.578, nothing qualifies on merit.
    const photos = GOLDEN_PHOTOS.map((p) => ({ ...p, width_px: 4032, height_px: 3024 }));
    const { clips, warnings } = scheduleClips(GOLDEN_ANNOTATIONS, photos);
    const pool = clips.filter((c) => c.engine !== 'seedance');
    const df = pool.filter((c) => c.engine === 'depthflow');
    expect(df.length / pool.length).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    expect(warnings.some((w) => w.code === 'depthflow_quota_over_threshold')).toBe(true);
  });

  it('skips photos with no annotation or no pixel dimensions', () => {
    const photos = [...GOLDEN_PHOTOS.slice(0, 3), { ...GOLDEN_PHOTOS[3]!, width_px: 0 }];
    const { clips } = scheduleClips(GOLDEN_ANNOTATIONS, photos);
    expect(clips).toHaveLength(3);
  });

  it('does not repeat a Seedance camera move on adjacent clips', () => {
    // Regression (curator-eval run 1, 2026-08-17): four open_space frames all
    // qualify for Seedance and all want a pull-back, so clips 5 and 6 came out
    // with the same move. The golden fixture never had two adjacent Seedance
    // clips of the same subject, so nothing caught it.
    const photos: PhotoMeta[] = [0, 1, 2, 3].map((i) => ({
      photo_id: `1000000${i}-0000-4000-8000-00000000000${i}`,
      poi_id: `poi-${i}`,
      poi_name: `Park ${i}`,
      bucket: 'outdoor',
      width_px: 4032,
      height_px: 3024,
      description: 'An open lawn with trees at the edge.',
    }));
    const annotations: PhotoAnnotation[] = photos.map((p, i) => ({
      photo_id: p.photo_id,
      has_natural_motion: true,
      motion_hint: 'trees moving in the wind',
      dominant_subject: 'open_space',
      has_visible_people: false,
      people_prominence: 'none',
      has_readable_brand_signage: false,
      has_rigid_geometry: false,
      narrative_role: 'establishing',
      time_of_day: 40 + i,
      emotional_weight: 0.8,
      poi_pair_with: null,
      pair_role: null,
      vo_line: '',
      chip_label: `Park ${i}`,
    }));
    const { clips } = scheduleClips(annotations, photos);
    expect(clips.every((c) => c.engine === 'seedance')).toBe(true);
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i]!.move).not.toBe(clips[i - 1]!.move);
    }
  });
});
