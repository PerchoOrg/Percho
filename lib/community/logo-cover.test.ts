import { describe, expect, it } from 'vitest';
import {
  type BoundaryGeoJSON,
  buildCommunityLogoDataUri,
  buildCommunityLogoSvg,
} from './logo-cover';

const SQUARE_POLY: BoundaryGeoJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [-84.4, 33.7],
      [-84.3, 33.7],
      [-84.3, 33.8],
      [-84.4, 33.8],
      [-84.4, 33.7],
    ],
  ],
};

const SLIVER_POLY: BoundaryGeoJSON = {
  // ~10:1 aspect — should fall back to monogram
  type: 'Polygon',
  coordinates: [
    [
      [-84.5, 33.7],
      [-84.0, 33.7],
      [-84.0, 33.75],
      [-84.5, 33.75],
      [-84.5, 33.7],
    ],
  ],
};

describe('buildCommunityLogoSvg', () => {
  it('produces an SVG containing the community name', () => {
    const svg = buildCommunityLogoSvg('Virginia-Highland', SQUARE_POLY);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Virginia-Highland');
    expect(svg).toContain('COMMUNITY');
  });

  it('renders a path for a normal-shaped boundary', () => {
    const svg = buildCommunityLogoSvg('Inman Park', SQUARE_POLY);
    expect(svg).toMatch(/<path d="M [^"]+/);
    expect(svg).not.toMatch(/font-size="96"/);
  });

  it('falls back to monogram for extreme aspect ratios', () => {
    const svg = buildCommunityLogoSvg('Ponce Corridor', SLIVER_POLY);
    // large centered text = monogram fallback
    expect(svg).toMatch(/font-size="96"/);
    expect(svg).toContain('PC'); // initials
  });

  it('falls back to monogram when boundary is null', () => {
    const svg = buildCommunityLogoSvg('Buckhead', null);
    expect(svg).toMatch(/font-size="96"/);
    expect(svg).toContain('B');
  });

  it('picks a stable palette per name (deterministic)', () => {
    const a = buildCommunityLogoSvg('Oakland City', SQUARE_POLY);
    const b = buildCommunityLogoSvg('Oakland City', SQUARE_POLY);
    expect(a).toBe(b);
  });

  it('picks different palettes for different names (usually)', () => {
    // pick names likely to hash to different palette indices
    const a = buildCommunityLogoSvg('Buckhead', SQUARE_POLY);
    const b = buildCommunityLogoSvg('Kirkwood', SQUARE_POLY);
    // extract first stop color
    const getColor = (s: string) => s.match(/stop-color="(#[0-9a-f]+)"/i)?.[1];
    expect(getColor(a)).not.toBe(getColor(b));
  });

  it('escapes XML special chars in the name', () => {
    const svg = buildCommunityLogoSvg('A & B <test>', SQUARE_POLY);
    expect(svg).toContain('A &amp; B &lt;test&gt;');
    expect(svg).not.toContain('A & B <test>');
  });

  it('supports MultiPolygon by picking the largest ring', () => {
    const multi: BoundaryGeoJSON = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-84.4, 33.7],
            [-84.39, 33.7],
            [-84.39, 33.71],
            [-84.4, 33.71],
            [-84.4, 33.7],
          ],
        ],
        SQUARE_POLY.coordinates,
      ],
    };
    const svg = buildCommunityLogoSvg('Multi Test', multi);
    expect(svg).toMatch(/<path d="M /);
  });
});

describe('buildCommunityLogoDataUri', () => {
  it('returns a valid data URI', () => {
    const uri = buildCommunityLogoDataUri('Test Neighborhood', SQUARE_POLY);
    expect(uri).not.toBeNull();
    expect(uri!.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });

  it('returns null for empty name', () => {
    expect(buildCommunityLogoDataUri('', null)).toBeNull();
  });
});
