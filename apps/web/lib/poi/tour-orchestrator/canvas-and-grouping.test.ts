/**
 * The 0.685 canvas, and chapters instead of spread buckets (2026-08-19).
 *
 * Both changes came from the same session: the tour's only playback surface is
 * the feed's community card, and the card decides both the shape of the frame
 * and — because it lays its own chrome over the bottom — where a label may sit.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_H,
  CANVAS_W,
  DEPTHFLOW_MAX_OVERFLOW,
  TARGET_ASPECT,
  type Unit,
  groupBuckets,
  overflow,
  schoolTierRank,
} from './scheduler';

/** Only `bucket` and `entries[0].meta.poi_name` are read by groupBuckets. */
function block(bucket: string, poiName: string): Unit[] {
  return [
    {
      entries: [{ meta: { poi_name: poiName } }],
      bucket,
      time: 0,
      emotion: 0,
      role: 'supporting',
      // biome-ignore lint/suspicious/noExplicitAny: narrow fixture for a pure fn
    } as any,
  ];
}
const names = (blocks: Unit[][]) =>
  blocks.map((b) => b[0]!.entries[0]!.meta.poi_name as unknown as string);

describe('canvas', () => {
  it('matches the feed card, not 9:16', () => {
    expect(CANVAS_W / CANVAS_H).toBeCloseTo(0.685, 3);
    expect(TARGET_ASPECT).toBe(CANVAS_W / CANVAS_H);
    // The card measures 0.679 (15 Plus) to 0.6934 (iPhone 15) across every
    // iPhone from the 13 mini up; the canvas sits inside that band.
    // Bounds written as fractions: biome reads a bare 0.693 as Math.LN2.
    expect(TARGET_ASPECT).toBeGreaterThan(679 / 1000);
    expect(TARGET_ASPECT).toBeLessThan(694 / 1000);
  });

  it('keeps a 3:4 portrait and a 4:3 landscape on opposite sides of the engine split', () => {
    const portrait = overflow(3, 4);
    const landscape = overflow(4, 3);
    expect(portrait).toBeLessThan(DEPTHFLOW_MAX_OVERFLOW);
    expect(landscape).toBeGreaterThan(DEPTHFLOW_MAX_OVERFLOW);
  });
});

describe('schoolTierRank', () => {
  it('orders elementary before middle before high', () => {
    expect(schoolTierRank('Sharon Elementary School')).toBe(0);
    expect(schoolTierRank('Riverwatch Middle School')).toBe(1);
    expect(schoolTierRank('Lambert High School')).toBe(2);
  });

  it('sorts an unrecognised name last rather than pretending it is a tier', () => {
    expect(schoolTierRank('Forsyth Academy')).toBe(3);
  });

  it('does not read "high" out of an unrelated word', () => {
    expect(schoolTierRank('Highland Primary')).toBe(0);
  });
});

describe('groupBuckets', () => {
  it('pulls the three schools together in tier order', () => {
    const out = groupBuckets([
      block('schools', 'Sharon Elementary School'),
      block('fitness', 'Onelife Fitness'),
      block('shopping', 'The Collection'),
      block('civic', 'Sharon Forks Library'),
      block('schools', 'Riverwatch Middle School'),
      block('schools', 'Lambert High School'),
    ]);
    expect(names(out)).toEqual([
      'Sharon Elementary School',
      'Riverwatch Middle School',
      'Lambert High School',
      'Onelife Fitness',
      'The Collection',
      'Sharon Forks Library',
    ]);
  });

  it('keeps a chapter at the position of its first block', () => {
    const out = groupBuckets([
      block('dining', 'Alessio'),
      block('shopping', 'Publix'),
      block('dining', 'Peony'),
    ]);
    expect(names(out)).toEqual(['Alessio', 'Peony', 'Publix']);
  });

  it('pins the opener and closer even when they share a bucket', () => {
    const opener = block('outdoor', 'Sims Lake Park');
    const closer = block('outdoor', 'Caney Creek');
    const out = groupBuckets(
      [opener, block('dining', 'Alessio'), block('outdoor', 'Chattahoochee'), closer],
      opener,
      closer,
    );
    expect(names(out)).toEqual(['Sims Lake Park', 'Alessio', 'Chattahoochee', 'Caney Creek']);
  });

  it('is a no-op when every block is already its own bucket', () => {
    const out = groupBuckets([block('dining', 'A'), block('shopping', 'B'), block('civic', 'C')]);
    expect(names(out)).toEqual(['A', 'B', 'C']);
  });
});
