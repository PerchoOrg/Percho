/**
 * Tests for the point-in-polygon geometry primitive.
 *
 * We test the pure geometry only (pointInPolygon / pointInBbox / bboxOf) —
 * findCommunityForPoint depends on Supabase + unstable_cache and is covered
 * by app-level integration checks, not unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  type GeoJsonPolygonLike,
  bboxOf,
  pointInBbox,
  pointInPolygon,
} from './point-in-polygon';

// A unit square (0,0)–(1,1) as a GeoJSON Polygon (closed ring, ccw)
const square: GeoJsonPolygonLike = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

// Square with a hole from (0.25,0.25)–(0.75,0.75)
const squareWithHole: GeoJsonPolygonLike = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
    [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
      [0.25, 0.25],
    ],
  ],
};

// Two disjoint squares as a MultiPolygon
const twoSquares: GeoJsonPolygonLike = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    [
      [
        [2, 2],
        [3, 2],
        [3, 3],
        [2, 3],
        [2, 2],
      ],
    ],
  ],
};

describe('pointInPolygon', () => {
  it('interior point is inside a simple square', () => {
    expect(pointInPolygon(0.5, 0.5, square)).toBe(true);
  });

  it('exterior point is outside a simple square', () => {
    expect(pointInPolygon(1.5, 0.5, square)).toBe(false);
    expect(pointInPolygon(-0.5, 0.5, square)).toBe(false);
  });

  it('point in the hole is NOT inside', () => {
    expect(pointInPolygon(0.5, 0.5, squareWithHole)).toBe(false);
  });

  it('point in the ring but not the hole IS inside', () => {
    expect(pointInPolygon(0.1, 0.1, squareWithHole)).toBe(true);
    expect(pointInPolygon(0.9, 0.9, squareWithHole)).toBe(true);
  });

  it('MultiPolygon matches if the point is in either part', () => {
    expect(pointInPolygon(0.5, 0.5, twoSquares)).toBe(true);
    expect(pointInPolygon(2.5, 2.5, twoSquares)).toBe(true);
    expect(pointInPolygon(1.5, 1.5, twoSquares)).toBe(false); // gap
  });

  it('handles the boundary edge case near a vertex', () => {
    // Ray-casting is sensitive to exact vertex-hits. We just make sure a
    // point clearly inside a diamond polygon returns true.
    const diamond: GeoJsonPolygonLike = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
          [0, 1],
        ],
      ],
    };
    expect(pointInPolygon(0, 0, diamond)).toBe(true);
    expect(pointInPolygon(0.9, 0, diamond)).toBe(true);
    expect(pointInPolygon(-0.9, 0, diamond)).toBe(true);
    expect(pointInPolygon(2, 2, diamond)).toBe(false);
  });
});

describe('bboxOf', () => {
  it('computes min/max lng/lat', () => {
    expect(bboxOf(square)).toEqual([0, 0, 1, 1]);
  });

  it('bbox spans the union of a MultiPolygon', () => {
    expect(bboxOf(twoSquares)).toEqual([0, 0, 3, 3]);
  });

  it('includes hole vertices too (holes are inside the outer bbox anyway)', () => {
    expect(bboxOf(squareWithHole)).toEqual([0, 0, 1, 1]);
  });
});

describe('pointInBbox', () => {
  it('inclusive on all four sides', () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    expect(pointInBbox(0, 0, bbox)).toBe(true);
    expect(pointInBbox(1, 1, bbox)).toBe(true);
    expect(pointInBbox(0.5, 0.5, bbox)).toBe(true);
    expect(pointInBbox(1.0001, 0.5, bbox)).toBe(false);
    expect(pointInBbox(-0.0001, 0.5, bbox)).toBe(false);
  });
});

describe('Atlanta-shaped realistic case', () => {
  // A crude polygon around the Buckhead area of Atlanta. This is not the
  // real seed — just a shape at realistic coordinates to guard against
  // sign / lng-lat-order regressions.
  const buckheadLike: GeoJsonPolygonLike = {
    type: 'Polygon',
    coordinates: [
      [
        [-84.395, 33.83],
        [-84.35, 33.83],
        [-84.35, 33.87],
        [-84.395, 33.87],
        [-84.395, 33.83],
      ],
    ],
  };

  it('point inside Buckhead-like polygon returns true', () => {
    // Roughly middle of the box
    expect(pointInPolygon(-84.37, 33.85, buckheadLike)).toBe(true);
  });

  it('downtown Atlanta point (south of Buckhead) returns false', () => {
    expect(pointInPolygon(-84.39, 33.75, buckheadLike)).toBe(false);
  });

  it('point in the Atlantic ocean returns false', () => {
    expect(pointInPolygon(-70, 33.85, buckheadLike)).toBe(false);
  });

  it('argument order guard: swapping lat/lng gives wrong answer', () => {
    // If a caller mistakenly passed (lat, lng) instead of (lng, lat), the
    // 33.85, -84.37 pair would be way outside the polygon. This exists so
    // future refactors do not silently invert the argument order.
    expect(pointInPolygon(33.85, -84.37, buckheadLike)).toBe(false);
  });
});
