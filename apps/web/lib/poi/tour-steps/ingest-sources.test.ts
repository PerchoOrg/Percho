import { describe, expect, it } from 'vitest';
import { sourcesFromResearch } from './ingest';

/** The shape `step_results.agent_research` actually has. */
const research = (
  agents: Record<
    string,
    { community_site?: string; pois?: Array<{ name: string; source: string }> }
  >,
) => ({
  agents: Object.fromEntries(Object.entries(agents).map(([k, v]) => [k, { parsed: v }])),
});

describe('sourcesFromResearch', () => {
  it('enables the community site and nothing else', () => {
    const out = sourcesFromResearch(
      research({
        gemini_a: {
          community_site: 'https://bellmoorepark.com/',
          pois: [
            {
              name: 'Lambert High School',
              source: 'https://forsyth.k12.ga.us/lambert',
            },
            {
              name: 'Big Creek Park',
              source: 'https://forsythcountyga.gov/parks/big-creek',
            },
          ],
        },
      }),
    );
    expect(out).toEqual([
      {
        url: 'https://bellmoorepark.com/',
        label: 'Home',
        origin: 'community_site',
      },
      {
        url: 'https://forsyth.k12.ga.us/lambert',
        label: 'Lambert High School',
        origin: 'research',
      },
      {
        url: 'https://forsythcountyga.gov/parks/big-creek',
        label: 'Big Creek Park',
        origin: 'research',
      },
    ]);
  });

  it('dedupes across both agents', () => {
    // The two grounding calls overlap heavily — 53% agreement on place_ids —
    // so the same page arrives twice more often than not.
    const out = sourcesFromResearch(
      research({
        gemini_a: {
          community_site: 'https://bellmoorepark.com/',
          pois: [
            {
              name: 'Big Creek Park',
              source: 'https://forsythcountyga.gov/parks',
            },
          ],
        },
        gemini_b: {
          community_site: 'https://bellmoorepark.com/',
          pois: [{ name: 'Big Creek', source: 'https://forsythcountyga.gov/parks' }],
        },
      }),
    );
    expect(out.map((s) => s.url)).toEqual([
      'https://bellmoorepark.com/',
      'https://forsythcountyga.gov/parks',
    ]);
  });

  it('never demotes the community site to an optional source', () => {
    // Both agents cite the community's own page as the source for its own
    // amenities. Order must not decide whether that page is enabled.
    const out = sourcesFromResearch(
      research({
        gemini_a: {
          community_site: 'https://bellmoorepark.com/amenities',
          pois: [{ name: 'The pool', source: 'https://bellmoorepark.com/amenities' }],
        },
      }),
    );
    expect(out).toEqual([
      {
        url: 'https://bellmoorepark.com/amenities',
        label: 'Amenities',
        origin: 'community_site',
      },
    ]);
  });

  it('ignores anything that is not an http URL', () => {
    const out = sourcesFromResearch(
      research({
        gemini_a: {
          community_site: 'n/a',
          pois: [
            { name: 'No source', source: '' },
            { name: 'Hearsay', source: 'the HOA newsletter' },
            { name: 'Real', source: 'https://example.org/park' },
          ],
        },
      }),
    );
    expect(out).toEqual([{ url: 'https://example.org/park', label: 'Real', origin: 'research' }]);
  });

  it('returns nothing for a run that has not researched', () => {
    expect(sourcesFromResearch(undefined)).toEqual([]);
    expect(sourcesFromResearch({})).toEqual([]);
    expect(sourcesFromResearch({ agents: { gemini_a: { parsed: null } } })).toEqual([]);
  });
});
