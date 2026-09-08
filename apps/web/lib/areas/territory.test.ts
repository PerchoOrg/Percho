import { describe, expect, it } from 'vitest';
import {
  type PolygonLike,
  type Position,
  bboxOf,
  coverage,
  dominant,
  inGeometry,
  prepare,
} from './territory';

/** A square from (x,y) to (x+w,y+w), counter-clockwise. */
function square(x: number, y: number, w: number): Position[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + w],
    [x, y + w],
    [x, y],
  ];
}

const unit: PolygonLike = { type: 'Polygon', coordinates: [square(0, 0, 10)] };

describe('inGeometry', () => {
  it('finds a point inside', () => {
    expect(inGeometry(5, 5, unit)).toBe(true);
  });

  it('rejects a point outside', () => {
    expect(inGeometry(15, 5, unit)).toBe(false);
    expect(inGeometry(5, -1, unit)).toBe(false);
  });

  it('excludes a hole', () => {
    // This is not hypothetical: City of Marietta runs its own electric utility
    // as an island inside Cobb EMC's territory, and so do East Point, Fairburn
    // and Palmetto inside Georgia Power's. Ignoring rings after the first would
    // credit every one of those cities to the surrounding co-op.
    const withHole: PolygonLike = {
      type: 'Polygon',
      coordinates: [square(0, 0, 10), square(4, 4, 2)],
    };
    expect(inGeometry(1, 1, withHole)).toBe(true);
    expect(inGeometry(5, 5, withHole)).toBe(false);
  });

  it('handles a multipolygon’s separate parts', () => {
    const two: PolygonLike = {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2)], [square(10, 10, 2)]],
    };
    expect(inGeometry(1, 1, two)).toBe(true);
    expect(inGeometry(11, 11, two)).toBe(true);
    expect(inGeometry(5, 5, two)).toBe(false);
  });

  it('does not double-count a vertex it passes level with', () => {
    // A ray at exactly a vertex's latitude crosses two edges meeting there;
    // the half-open y test makes that count once.
    expect(inGeometry(5, 0, unit) || inGeometry(5, 10, unit)).toBe(true);
  });
});

describe('bboxOf', () => {
  it('bounds a multipolygon across all its parts', () => {
    const two: PolygonLike = {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2)], [square(10, 10, 2)]],
    };
    expect(bboxOf(two)).toEqual({ minX: 0, minY: 0, maxX: 12, maxY: 12 });
  });
});

describe('coverage', () => {
  /** Two territories splitting the unit square down the middle. */
  const west = {
    value: 'WEST',
    geometry: { type: 'Polygon', coordinates: [square(0, 0, 5)] } as PolygonLike,
  };
  const east = {
    value: 'EAST',
    geometry: { type: 'Polygon', coordinates: [square(5, 0, 5)] } as PolygonLike,
  };

  it('splits a county between two territories in proportion to area', () => {
    const res = coverage(unit, prepare([west, east]), 40);
    const byName = new Map(res.shares.map((s) => [s.value, s.share]));
    // WEST covers the lower-left quarter, EAST the lower-right quarter.
    expect(byName.get('WEST')).toBeCloseTo(0.25, 1);
    expect(byName.get('EAST')).toBeCloseTo(0.25, 1);
  });

  it('counts the rest as unclaimed rather than assigning it', () => {
    const res = coverage(unit, prepare([west]), 40);
    expect(res.unclaimed).toBeGreaterThan(0);
    const claimed = (res.shares[0]?.share ?? 0) * res.sampled;
    expect(res.unclaimed + claimed).toBeCloseTo(res.sampled, 0);
  });

  it('sums to one when the county is fully covered', () => {
    const whole = { value: 'ALL', geometry: unit };
    const res = coverage(unit, prepare([whole]), 30);
    expect(res.unclaimed).toBe(0);
    expect(res.shares.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1, 6);
  });

  it('samples the county’s shape, not its bounding box', () => {
    // An L-shape: a grid over its bbox would put a quarter of its points in
    // empty space and quietly deflate every share.
    const ell: PolygonLike = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [5, 5],
          [5, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    const whole = {
      value: 'ALL',
      geometry: { type: 'Polygon', coordinates: [square(0, 0, 10)] } as PolygonLike,
    };
    const res = coverage(ell, prepare([whole]), 60);
    expect(res.shares[0]?.share).toBeCloseTo(1, 6);
    // The L is 3/4 of its bbox, so roughly 3/4 of the grid should be sampled.
    expect(res.sampled / (61 * 61)).toBeCloseTo(0.75, 1);
  });

  it('gives a territory the point, not the hole it sits in', () => {
    const donut = {
      value: 'COOP',
      geometry: {
        type: 'Polygon',
        coordinates: [square(0, 0, 10), square(4, 4, 2)],
      } as PolygonLike,
    };
    const city = {
      value: 'CITY',
      geometry: { type: 'Polygon', coordinates: [square(4, 4, 2)] } as PolygonLike,
    };
    const res = coverage(unit, prepare([donut, city]), 60);
    const byName = new Map(res.shares.map((s) => [s.value, s.share]));
    expect(byName.get('CITY')).toBeCloseTo(0.04, 1);
    expect(res.unclaimed).toBe(0);
  });

  it('has no shares for a county nothing covers', () => {
    const far = {
      value: 'FAR',
      geometry: { type: 'Polygon', coordinates: [square(100, 100, 5)] } as PolygonLike,
    };
    const res = coverage(unit, prepare([far]), 20);
    expect(res.shares).toHaveLength(0);
    expect(res.unclaimed).toBe(res.sampled);
  });
});

describe('dominant', () => {
  const res = (shares: [string, number][]) => ({
    shares: shares.map(([value, share]) => ({ value, share })),
    sampled: 100,
    unclaimed: 0,
  });

  it('names the provider that covers a majority', () => {
    expect(
      dominant(
        res([
          ['A', 0.85],
          ['B', 0.15],
        ]),
      )?.value,
    ).toBe('A');
  });

  it('names nobody for a county that is genuinely split', () => {
    // Cobb is real: Cobb EMC 41%, Georgia Power 39%, City of Marietta 15%.
    // Putting one utility's rate on that county's bill would be a rate 59% of
    // the county does not pay.
    expect(
      dominant(
        res([
          ['COBB EMC', 0.41],
          ['GEORGIA POWER', 0.39],
        ]),
      ),
    ).toBeUndefined();
  });

  it('takes a bare majority, and the threshold is adjustable', () => {
    const split = res([
      ['A', 0.51],
      ['B', 0.49],
    ]);
    expect(dominant(split)?.value).toBe('A');
    expect(dominant(split, 0.6)).toBeUndefined();
  });

  it('names nobody when nothing was covered', () => {
    expect(dominant({ shares: [], sampled: 10, unclaimed: 10 })).toBeUndefined();
  });
});
