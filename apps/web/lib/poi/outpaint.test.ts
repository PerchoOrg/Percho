import { describe, expect, it } from 'vitest';
import { OUTPAINT_MIN_CROP_LOSS, cropLoss, cropWindowFor, needsOutpaint } from './outpaint';

describe('cropLoss', () => {
  it('is zero on a frame that already matches the canvas', () => {
    expect(cropLoss(1080, 1920)).toBeCloseTo(0, 6);
    expect(cropLoss(540, 960)).toBeCloseTo(0, 6);
  });

  it('matches the shapes measured on Aberdeen', () => {
    expect(cropLoss(3024, 4032)).toBeCloseTo(0.25, 2); // 3:4 portrait
    expect(cropLoss(3000, 3000)).toBeCloseTo(0.44, 2); // square
    expect(cropLoss(4032, 3024)).toBeCloseTo(0.578, 2); // 4:3 landscape
    expect(cropLoss(1920, 890)).toBeCloseTo(0.74, 2); // the clubhouse panorama
  });

  it('treats a missing size as nothing to fix rather than everything', () => {
    expect(cropLoss(0, 0)).toBe(0);
  });
});

describe('needsOutpaint', () => {
  it('leaves a portrait photo alone', () => {
    // "unless the original photo is in a good shape already" — a 3:4 portrait
    // loses a quarter of the frame and is not worth an API call.
    expect(needsOutpaint(3024, 4032)).toBe(false);
    expect(needsOutpaint(2400, 3000)).toBe(false);
    expect(needsOutpaint(1080, 1920)).toBe(false);
  });

  it('reframes anything square or wider', () => {
    expect(needsOutpaint(3000, 3000)).toBe(true);
    expect(needsOutpaint(4032, 3024)).toBe(true);
    expect(needsOutpaint(1920, 890)).toBe(true);
  });

  it('sits exactly where the threshold says', () => {
    // Guards the constant against a silent edit: 4:5 is in, square is out.
    expect(cropLoss(2400, 3000)).toBeLessThan(OUTPAINT_MIN_CROP_LOSS);
    expect(cropLoss(3000, 3000)).toBeGreaterThan(OUTPAINT_MIN_CROP_LOSS);
  });
});

describe('cropWindowFor', () => {
  it('takes a 3:4 window at full height', () => {
    const w = cropWindowFor(4000, 3000);
    expect(w.height).toBe(3000);
    expect(w.width).toBe(2250);
    expect(w.width / w.height).toBeCloseTo(0.75, 3);
  });

  it('follows the focus point instead of always centring', () => {
    // The clubhouse tower sits right-of-centre; a centred crop loses it.
    const centred = cropWindowFor(1920, 890, 0.5);
    const biased = cropWindowFor(1920, 890, 0.76);
    expect(biased.left).toBeGreaterThan(centred.left);
  });

  it('never runs off either edge', () => {
    for (const focus of [0, 0.1, 0.5, 0.9, 1]) {
      const w = cropWindowFor(1920, 890, focus);
      expect(w.left).toBeGreaterThanOrEqual(0);
      expect(w.left + w.width).toBeLessThanOrEqual(1920);
    }
  });

  it('keeps the whole frame when it is already narrower than 3:4', () => {
    const w = cropWindowFor(800, 1600);
    expect(w.left).toBe(0);
    expect(w.width).toBe(800);
  });
});
