import { describe, expect, it } from 'vitest';
import { TOUR_XFADE_S, tourSegments } from './tour-segments';

const clip = (poi: string, duration_s: number, name = poi) => ({
  poi_id: poi,
  poi_name: name,
  duration_s,
});

describe('tourSegments', () => {
  /**
   * The guard this file exists for. `scripts/ken-burns/xfade.py` documents
   * `crossfade_offsets([3,3,3], 0.5) → [2.5, 5.0]`, and `clip_start_times`
   * turns that into starts of `[0, 3.0, 5.5]` over a total of 8.0s. Three
   * clips of three different places must land on exactly those boundaries.
   *
   * If the render worker's xfade ever changes, THIS is the test that should go
   * red — see the module header.
   */
  it('places boundaries where the render worker starts each clip', () => {
    const segments = tourSegments([clip('a', 3), clip('b', 3), clip('c', 3)]);
    expect(segments.map((s) => s.name)).toEqual(['a', 'b', 'c']);
    expect(segments.map((s) => s.endFraction)).toEqual([3.0 / 8, 5.5 / 8, 1]);
  });

  /**
   * Pins the SIZE of the crossfade correction, because the module header used
   * to overstate it. Laid out as fractions, most of the 0.5s overlap cancels
   * against the shortened total: the worst boundary on a 3-clip film moves
   * 3.8% of the bar, and on a 14-clip film 1.2%. Small, real, and not the
   * "visibly out of step" the first draft claimed.
   */
  it('corrects boundaries by a few percent, not by a few tenths', () => {
    const three = tourSegments([clip('a', 3), clip('b', 3), clip('c', 3)]);
    const drift3 = Math.max(
      ...three.map((s, i) => Math.abs(s.endFraction - (i + 1) / three.length)),
    );
    expect(drift3).toBeGreaterThan(0.02);
    expect(drift3).toBeLessThan(0.05);

    const many = tourSegments(Array.from({ length: 14 }, (_, i) => clip(`p${i}`, 3.25)));
    const drift14 = Math.max(
      ...many.map((s, i) => Math.abs(s.endFraction - (i + 1) / many.length)),
    );
    expect(drift14).toBeLessThan(0.02);
  });

  it('groups consecutive clips of the same place into one dash', () => {
    // The real shape: the planner cuts about three clips per place.
    const segments = tourSegments([
      clip('park', 3),
      clip('park', 3),
      clip('park', 3),
      clip('cafe', 3),
      clip('cafe', 3),
    ]);
    expect(segments.map((s) => s.name)).toEqual(['park', 'cafe']);
  });

  it('does not merge a place the film returns to later', () => {
    const segments = tourSegments([clip('a', 3), clip('b', 3), clip('a', 3)]);
    expect(segments.map((s) => s.name)).toEqual(['a', 'b', 'a']);
  });

  it('always completes the bar', () => {
    const segments = tourSegments([clip('a', 2.5), clip('b', 4.5), clip('c', 3.25)]);
    expect(segments[segments.length - 1]?.endFraction).toBe(1);
  });

  it('rises monotonically', () => {
    const segments = tourSegments([clip('a', 2), clip('b', 4.5), clip('c', 3), clip('d', 2)]);
    const fractions = segments.map((s) => s.endFraction);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i] ?? 0).toBeGreaterThan(fractions[i - 1] ?? 0);
    }
  });

  it('falls back to no segments rather than to wrong ones', () => {
    expect(tourSegments(null)).toEqual([]);
    expect(tourSegments([])).toEqual([]);
    expect(tourSegments('not an array')).toEqual([]);
    // One unreadable duration invalidates every boundary after it.
    expect(tourSegments([clip('a', 3), { poi_id: 'b', poi_name: 'b' }])).toEqual([]);
    expect(tourSegments([clip('a', 3), clip('b', 0)])).toEqual([]);
    // Clips shorter than the transitions between them are not a timeline.
    expect(tourSegments([clip('a', 0.2), clip('b', 0.2)])).toEqual([]);
  });

  it('keeps a clip with no poi id as its own dash', () => {
    const segments = tourSegments([
      { poi_name: 'Somewhere', duration_s: 3 },
      { poi_name: 'Somewhere', duration_s: 3 },
    ]);
    // Grouped on the NAME when there is no id — same place, one dash.
    expect(segments).toHaveLength(1);
  });

  /**
   * phase174: the distance rides along with the name. The two were one object
   * while the render worker burned them into the film; the card draws them now
   * and needs both off the same clip.
   */
  it('carries the clip distance onto the segment', () => {
    const segments = tourSegments([
      { ...clip('a', 3), label_distance: '0 mi' },
      { ...clip('b', 3), label_distance: '2.4 mi' },
    ]);
    expect(segments.map((s) => s.distance)).toEqual(['0 mi', '2.4 mi']);
  });

  it('omits the distance when the clip has none', () => {
    const [segment] = tourSegments([clip('a', 3), clip('b', 3)]);
    expect(segment && 'distance' in segment).toBe(false);
  });

  it('matches the worker constant', () => {
    expect(TOUR_XFADE_S).toBe(0.5);
  });
});
