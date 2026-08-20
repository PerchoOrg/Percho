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
  scheduleClips,
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

describe('DepthFlow never touches a photo with people', () => {
  // Depth Anything warps a person across a depth discontinuity. Owner
  // 2026-08-19, standing rule: "never use depth anything for any photos with
  // people in it".
  const photo = (id: string, people: string, subject = 'open_space') => ({
    photo_id: id,
    dominant_subject: subject,
    people_prominence: people,
    narrative_role: 'establishing',
    emotional_weight: 0.5,
    has_natural_motion: false,
    has_readable_brand_signage: false,
    time_of_day: 50,
  });
  const meta = (id: string) => ({
    photo_id: id,
    poi_id: `poi-${id}`,
    poi_name: `Place ${id}`,
    bucket: 'outdoor',
    width_px: 3000,
    height_px: 2000,
  });

  it('leaves every people photo on a non-parallax engine', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    // Half the pool has people; the DepthFlow quota is a third to a half, so a
    // people-blind scheduler would be forced to pick some of them.
    const anns = ids.map((id, i) => photo(id, i % 2 === 0 ? 'background' : 'none'));
    // biome-ignore lint/suspicious/noExplicitAny: fixture for a pure fn
    const { clips } = scheduleClips(anns as any, ids.map(meta) as any);
    // The assertion below is only meaningful if DepthFlow ran at all — the
    // quota has to have been filled from the half of the pool without people.
    expect(clips.filter((c) => c.engine === 'depthflow').length).toBeGreaterThan(0);
    for (const c of clips) {
      const ann = anns.find((a) => a.photo_id === c.photo_id);
      if (ann && ann.people_prominence !== 'none') expect(c.engine).not.toBe('depthflow');
    }
  });
});
