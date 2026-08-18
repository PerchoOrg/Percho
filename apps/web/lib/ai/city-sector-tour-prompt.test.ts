import { describe, expect, it } from 'vitest';
import { buildCitySectorResearchPrompt } from './city-sector-tour-prompt';

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-84.1, 34],
      [-84, 34],
      [-84, 34.1],
      [-84.1, 34.1],
      [-84.1, 34],
    ],
  ],
};

describe('buildCitySectorResearchPrompt', () => {
  it('coordinates every sector in one call and makes array order intentional', () => {
    const prompt = buildCitySectorResearchPrompt({
      city: 'Suwanee',
      state: 'GA',
      sectors: ['north', 'west', 'south', 'east'].map((slug, index) => ({
        slug,
        name: `${slug} sector`,
        description: `${slug} identity`,
        lat: 34 + index / 100,
        lng: -84 - index / 100,
        boundary: square,
      })),
    });
    for (const slug of ['north', 'west', 'south', 'east']) expect(prompt).toContain(slug);
    expect(prompt).toContain('A POI may appear in only ONE sector');
    expect(prompt).toContain('the array order is a production instruction');
    expect(prompt).toContain('Tie each school to exactly one sector');
    expect(prompt).toContain('6-10 useful POIs per sector');
  });
});
