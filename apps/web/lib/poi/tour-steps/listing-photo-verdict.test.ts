/**
 * A community film is not a listing.
 *
 * Owner 2026-08-23, after Bellmoore Park's builder site handed the pipeline 92
 * interior and exterior photos of two specific houses for sale: "it is ok to
 * have photos for multiple houses to give a vibe but not single one even
 * inside designs".
 */

import { describe, expect, it } from 'vitest';
import { LISTING_PHOTO_DROP_REASON, initialVerdict } from './shots';

/** A photo that passes every other gate, so only the scope rule decides. */
const photo = (residential_scope?: string) => ({
  ai_tags: { description: 'x', usable: true, ...(residential_scope ? { residential_scope } : {}) },
  width_px: 1920,
  height_px: 1080,
  storage_path: 'poi/x/y.jpg',
});

describe('initialVerdict — residential scope', () => {
  it('drops one house shot as a portrait', () => {
    expect(initialVerdict(photo('single_home'))).toEqual({
      ok: false,
      reason: LISTING_PHOTO_DROP_REASON,
    });
  });

  it('drops the inside of a home, model or not', () => {
    expect(initialVerdict(photo('home_interior'))).toEqual({
      ok: false,
      reason: LISTING_PHOTO_DROP_REASON,
    });
  });

  it('KEEPS several houses — a streetscape is the neighbourhood', () => {
    expect(initialVerdict(photo('multiple_homes'))).toEqual({ ok: true });
  });

  it('keeps everything that is not residential', () => {
    expect(initialVerdict(photo('none'))).toEqual({ ok: true });
  });

  it('keeps a photo tagged before the field existed', () => {
    // The whole back catalogue is in this state. A missing key must not start
    // rejecting photos that were fine yesterday.
    expect(initialVerdict(photo())).toEqual({ ok: true });
    expect(initialVerdict(photo('nonsense-from-a-model'))).toEqual({ ok: true });
  });

  it('still applies the older gates first', () => {
    expect(initialVerdict({ ...photo('multiple_homes'), storage_path: null })).toMatchObject({
      ok: false,
    });
    expect(
      initialVerdict({
        ai_tags: { usable: false, residential_scope: 'none' },
        width_px: 1920,
        height_px: 1080,
        storage_path: 'p.jpg',
      }),
    ).toEqual({ ok: false, reason: 'tagger-unusable' });
  });
});
