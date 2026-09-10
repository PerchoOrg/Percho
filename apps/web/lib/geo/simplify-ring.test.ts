/**
 * Tests for the display-only ring simplifier.
 *
 * The properties that matter for a map: a straight run collapses, a corner
 * survives, a shape never degenerates below a triangle, and anything the
 * `boundary` column can actually hold — including the 11 Nextdoor seeds that
 * are not valid OGC polygons — degrades to `[]` rather than throwing.
 */

import { describe, expect, it } from 'vitest';
import { type Ring, displayRingsFromGeoJson, simplifyRing } from './simplify-ring';

/** A closed square, with `extra` collinear points along its bottom edge. */
function squareWithCollinear(extra: number): Ring {
  const bottom: Ring = [];
  for (let i = 0; i <= extra; i++) bottom.push([i / (extra + 1), 0]);
  return [...bottom, [1, 0], [1, 1], [0, 1], [0, 0]];
}

describe('simplifyRing', () => {
  it('drops points that sit on a straight run', () => {
    const out = simplifyRing(squareWithCollinear(20), 0.0003);
    // The four corners plus the closing point; every interpolated point on the
    // bottom edge is within tolerance of it.
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0]).toEqual([0, 0]);
    expect(out).toContainEqual([1, 1]);
  });

  it('keeps a corner that is further than the tolerance', () => {
    const spike: Ring = [
      [0, 0],
      [0.5, 0.5],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(simplifyRing(spike, 0.0003)).toContainEqual([0.5, 0.5]);
  });

  it('returns the original rather than degenerating below a triangle', () => {
    // A tolerance this coarse would flatten the square to two points.
    const square = squareWithCollinear(0);
    expect(simplifyRing(square, 10)).toEqual(square);
  });

  it('leaves a ring of three or fewer points alone', () => {
    const tiny: Ring = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    expect(simplifyRing(tiny, 0.5)).toEqual(tiny);
  });
});

describe('displayRingsFromGeoJson', () => {
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];

  it('reads a Polygon and drops its holes', () => {
    const hole = [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.2],
    ];
    const rings = displayRingsFromGeoJson({ type: 'Polygon', coordinates: [square, hole] });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it('reads one outer ring per polygon of a MultiPolygon', () => {
    const rings = displayRingsFromGeoJson({
      type: 'MultiPolygon',
      coordinates: [[square], [square]],
    });
    expect(rings).toHaveLength(2);
  });

  it.each([
    ['null', null],
    ['a string', 'POLYGON((0 0))'],
    ['an unknown type', { type: 'Point', coordinates: [0, 0] }],
    ['no coordinates', { type: 'Polygon' }],
    ['a ring too short to close', { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }],
    ['non-numeric points', { type: 'Polygon', coordinates: [[['a', 'b'], ['c', 'd']]] }],
  ])('returns [] for %s', (_label, input) => {
    expect(displayRingsFromGeoJson(input)).toEqual([]);
  });
});
