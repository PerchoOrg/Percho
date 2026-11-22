import { describe, expect, it } from 'vitest';
import { communityProfileSchema } from '../zod/community-profile';
import {
  type BuildCommunity,
  type BuildInputs,
  type BuildSchool,
  buildContext,
  buildProfile,
  mergeProfile,
  milesBetween,
  usdShort,
} from './profile-build';

const years = (from: number, values: number[]) =>
  values.map((value, i) => ({ year: from + i, value }));

/** Forty communities in Alpharetta; only the first few say anything unusual. */
function community(i: number, over: Partial<BuildCommunity> = {}): BuildCommunity {
  return {
    slug: `c${i}`,
    city: 'Alpharetta',
    county: 'Fulton',
    lat: 34.07,
    lng: -84.25,
    residents_count: String(100 + i * 10),
    attributes: ['Peaceful', 'Family Friendly', 'Nice'],
    nextdoor_url: `https://nextdoor.com/neighborhood/c${i}/`,
    website: null,
    ...over,
  };
}

const school = (
  name: string,
  level: BuildSchool['level'],
  pct: number,
  lat = 34.07,
): BuildSchool => ({
  name,
  level,
  pct,
  lat,
  lng: -84.25,
});

const subject = community(0, {
  slug: 'windward',
  residents_count: '4,589',
  attributes: ['Convenient', 'Peaceful', 'Family Friendly', 'Safe', 'Nice', ' Quiet '],
  website: 'https://example.org/',
});

const inputs: BuildInputs = {
  communities: [subject, ...Array.from({ length: 39 }, (_, i) => community(i + 1))],
  schools: [
    school('Near Elementary School', 'elementary', 95),
    school('Far Elementary School', 'elementary', 99, 34.3),
    ...Array.from({ length: 98 }, (_, i) => school(`E${i}`, 'elementary', i / 2, 40)),
    school('Near Middle School', 'middle', 50),
    school('Other Middle School', 'middle', 80, 40),
    school('Listed High School', 'high', 70, 34.12),
    school('Near High School', 'high', 40),
  ],
  zhvi: {
    asOf: '2026-09-30',
    metro: {
      name: 'Metro Atlanta',
      series: years(
        2016,
        [200, 210, 220, 230, 260, 320, 380, 385, 390, 380, 376].map((k) => k * 1000),
      ),
    },
    cities: [
      {
        city: 'Alpharetta',
        county: 'Fulton',
        metroAtlanta: true,
        series: years(
          2016,
          [400, 420, 440, 450, 440, 550, 680, 700, 710, 712, 711].map((k) => k * 1000),
        ),
      },
      {
        city: 'Cheaper',
        county: 'Cobb',
        metroAtlanta: true,
        series: years(
          2016,
          [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 300].map((k) => k * 1000),
        ),
      },
      {
        city: 'Dahlonega',
        county: 'Lumpkin',
        metroAtlanta: false,
        series: years(
          2016,
          [150, 150, 160, 170, 180, 200, 250, 270, 300, 290, 280].map((k) => k * 1000),
        ),
      },
    ],
  },
  costs: new Map([
    [
      'fulton',
      {
        taxRatePct: { value: 1.02, estimated: true },
        electric: { value: 150, estimated: false },
        trash: { value: 30, estimated: true },
      },
    ],
  ]),
  events: new Map([
    [
      'alpharetta',
      {
        source: 'Awesome Alpharetta',
        events: [{ date: '2026-11-21', title: 'Tree lighting', where: 'Downtown' }],
      },
    ],
  ]),
  asOf: '2026-11-15',
};
const ctx = buildContext(inputs);
const profile = buildProfile(subject, ctx);

describe('buildProfile', () => {
  it('fits the schema the page reads', () => {
    const parsed = communityProfileSchema.safeParse(profile);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('ranks the nearest school at each level against every school of that level', () => {
    const rows = profile?.ranks?.rows.filter((r) => r.group === 'Schools');
    expect(rows?.map((r) => [r.label, r.note, r.rank, r.of])).toEqual([
      ['Elementary', 'Near', '#2', 'of 100 in GA'],
      ['Middle', 'Near', '#2', 'of 2 in GA'],
      ['High', 'Near', '#2', 'of 2 in GA'],
    ]);
    expect(profile?.ranks?.note).toMatch(/not an attendance zone/);
  });

  it("prefers a school the community's own list names over a nearer one", () => {
    const listed = buildProfile({ ...subject, schoolNames: ['Listed High'] }, ctx);
    const high = listed?.ranks?.rows.find((r) => r.label === 'High');
    expect([high?.note, high?.rank]).toEqual(['Listed', '#1']);
  });

  it('ranks the city against metro cities only, and the community against its city', () => {
    const rows = profile?.ranks?.rows ?? [];
    expect(rows.find((r) => r.label === 'Home value')).toMatchObject({
      note: '$711K',
      rank: '#1',
      of: 'of 2 metro cities',
      tile: '#1',
    });
    expect(rows.find((r) => r.label === 'Size')).toMatchObject({
      note: '4,589 on Nextdoor',
      rank: '#1',
      of: 'of 40 in city',
    });
    const outside = buildProfile(community(50, { city: 'Dahlonega', county: 'Lumpkin' }), ctx);
    expect(outside?.ranks?.rows.some((r) => r.group === 'Homes')).toBe(false);
    expect(outside?.homeValue?.area).toBe('Dahlonega');
  });

  it('draws the city against the metro, and says how it moved', () => {
    expect(profile?.homeValue).toMatchObject({
      area: 'Alpharetta',
      display: '$711K',
      change: '+62% since 2020',
      headline: 'Up 62% since 2020. Flat since 2024.',
      baseline: 'Metro Atlanta',
    });
    expect(profile?.homeValue?.series).toHaveLength(11);
    expect(profile?.homeValue?.series[0]).toEqual({ year: 2016, value: 400000, baseline: 200000 });
  });

  it('prices a month of holding from the county, and marks what is estimated', () => {
    expect(profile?.homeValue?.holding).toEqual({
      display: '≈ $780',
      basis: 'a month to hold the typical Alpharetta home, before mortgage and HOA',
      rows: [
        { label: 'Property tax', usd: 604, note: 'est. 1.02%' },
        { label: 'Electricity', usd: 150 },
        { label: 'Trash', usd: 30, note: 'est.' },
      ],
    });
    const noCounty = buildProfile({ ...subject, county: 'Nowhere' }, ctx);
    expect(noCounty?.homeValue?.holding).toBeUndefined();
  });

  it('charts only words about the place, rarest first', () => {
    expect(profile?.words).toEqual({
      lead: 'Convenient',
      leadNote: '1 in 40 communities say it',
      scope: '40 Alpharetta communities',
      rows: [
        { word: 'Convenient', pct: 3 },
        { word: 'Quiet', pct: 3 },
        { word: 'Peaceful', pct: 100 },
      ],
    });
    const peopleWords = buildProfile(
      { ...subject, attributes: ['Family Friendly', 'Safe', 'Kids', 'Nice'] },
      ctx,
    );
    expect(peopleWords?.words).toBeUndefined();
  });

  it('leads with what is specific to the community, and says nothing of its schools', () => {
    // The schools tile under the verdict names each school and its standing;
    // a line above it saying "Top-5% elementary nearby" said it twice.
    expect(profile?.verdict).toEqual({
      good: ['Residents say “Convenient”'],
      watch: ['Big: 4,589 neighbours'],
    });
    const plain = buildProfile(community(7), ctx);
    expect(plain?.verdict.watch).toEqual([]);
    expect(JSON.stringify(plain?.verdict)).not.toMatch(/Values|bottom|low|school|elementary/i);
  });

  it('says how far each school is', () => {
    const rows = profile?.ranks?.rows.filter((r) => r.group === 'Schools') ?? [];
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.distance).toMatch(/^\d+(\.\d)? mi$/);
    // A value or a size is not a place, so it has no distance.
    expect(profile?.ranks?.rows.find((r) => r.group === 'Homes')?.distance).toBeUndefined();
  });

  it('states safety as facts about the place, and only where they were looked up', () => {
    expect(profile?.safety).toBeUndefined();
    const looked = buildProfile(
      subject,
      buildContext({
        ...inputs,
        safety: new Map([
          [
            'windward',
            {
              hospital: { name: 'Northside Hospital Forsyth', miles: 2.44 },
              fire: { name: 'Fire Station #1', miles: 0.9 },
              flood: { zone: 'X', subtype: 'AREA OF MINIMAL FLOOD HAZARD', sfha: false },
            },
          ],
        ]),
      }),
    );
    expect(looked?.safety?.rows).toEqual([
      { label: 'Hospital', name: 'Northside Hospital Forsyth', note: '2.4 mi' },
      { label: 'Fire station', name: 'Fire Station #1', note: '0.9 mi' },
      { label: 'Flood zone', name: 'Minimal flood hazard', note: 'Zone X' },
    ]);
    expect(looked?.sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(['FEMA National Flood Hazard Layer', 'OpenStreetMap']),
    );
    expect(communityProfileSchema.safeParse(looked).success).toBe(true);
    // FEMA's 1%-a-year floodplain at the one point read is said of a part.
    const wet = buildProfile(
      subject,
      buildContext({
        ...inputs,
        safety: new Map([['windward', { flood: { zone: 'AE', subtype: '', sfha: true } }]]),
      }),
    );
    expect(wet?.safety?.rows).toEqual([
      { label: 'Flood zone', name: 'Part is in a flood zone', note: 'Zone AE' },
    ]);
  });

  it("links the community's own pages, https only, and carries its city's events", () => {
    expect(profile?.links?.slice(0, 2)).toEqual([
      { group: 'Community', label: 'Website', url: 'https://example.org/' },
      { group: 'Community', label: 'Nextdoor', url: 'https://nextdoor.com/neighborhood/c0/' },
    ]);
    const http = buildProfile({ ...subject, website: 'http://example.org' }, ctx)?.links ?? [];
    expect(http.map((l) => l.label)).not.toContain('Website');
  });

  it('adds search links for a named community, and its nearby schools on GreatSchools', () => {
    const named = buildProfile(
      { ...subject, name: 'Wild Timber', city: 'Sugar Hill', builder: 'The Providence Group' },
      ctx,
    );
    const links = named?.links ?? [];
    expect(links.map((l) => l.label)).toEqual([
      'Providence Group',
      'Nextdoor',
      'Reddit',
      'Google Maps',
      'YouTube',
      'Homes on Zillow',
      'Redfin',
      'Trulia',
      'Homes.com',
      'Property records',
      'Near ES',
      'Near MS',
      'Near HS',
      'School district',
      'Crime map',
      'FEMA flood map',
      'City of Sugar Hill',
      'Fulton County',
      'Walk Score',
    ]);
    const at = (label: string) => links.find((l) => l.label === label)?.url;
    // Redfin by its own city id; Trulia and Homes.com by the city's name.
    expect(at('Redfin')).toBe('https://www.redfin.com/city/18846/GA/Sugar-Hill');
    expect(at('Trulia')).toBe('https://www.trulia.com/GA/Sugar_Hill/');
    expect(at('Homes.com')).toBe('https://www.homes.com/sugar-hill-ga/');
    expect(at('YouTube')).toBe(
      'https://www.youtube.com/results?search_query=Wild%20Timber%20Sugar%20Hill%20GA',
    );
    expect(at('Walk Score')).toBe('https://www.walkscore.com/score/loc/lat=34.07/lng=-84.25');
    // Every link sits under a heading the page draws.
    expect([...new Set(links.map((l) => l.group))]).toEqual([
      'Community',
      'Homes',
      'Schools',
      'Safety',
      'City',
    ]);
    // Crime is a link out to the agencies' own map, never a figure here; the
    // flood map opens on the community's own point.
    expect(at('Crime map')).toBe('https://communitycrimemap.com/?address=Sugar%20Hill%2C%20GA');
    expect(at('FEMA flood map')).toContain('center=-84.25,34.07&level=15');
    expect(at('City of Sugar Hill')).toBe('https://cityofsugarhill.com/');
    expect(links[3]?.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Wild%20Timber%2C%20Sugar%20Hill%2C%20GA',
    );
    expect(at('Homes on Zillow')).toBe(
      'https://www.zillow.com/homes/Wild-Timber-Sugar-Hill-GA_rb/',
    );
    expect(at('Near ES')).toContain('greatschools.org/search/search.page?q=Near%20Elementary');
    expect(communityProfileSchema.safeParse(named).success).toBe(true);
    expect(profile?.events).toHaveLength(1);
    expect(profile?.sources.map((s) => s.name)).toEqual([
      'Georgia Milestones',
      'Nextdoor',
      'Zillow Home Value Index',
      'Percho county estimates',
      'Awesome Alpharetta',
    ]);
  });

  it('says nothing about a community it knows nothing about', () => {
    const blank = community(60, {
      city: null,
      lat: null,
      lng: null,
      attributes: null,
      residents_count: null,
    });
    expect(buildProfile(blank, ctx)).toBeNull();
  });
});

describe('mergeProfile', () => {
  it('lays research over computation block by block, and names every source', () => {
    const merged = mergeProfile(profile, {
      verdict: { good: ['Private 200-acre lake'], watch: [] },
      sources: [{ name: 'Windward Community Services Association' }, { name: 'Nextdoor' }],
    });
    expect(merged?.verdict.good).toEqual(['Private 200-acre lake']);
    expect(merged?.ranks).toEqual(profile?.ranks);
    expect(merged?.sources.map((s) => s.name)).toEqual([
      'Windward Community Services Association',
      'Nextdoor',
      'Georgia Milestones',
      'Zillow Home Value Index',
      'Percho county estimates',
      'Awesome Alpharetta',
    ]);
    const withLinks = mergeProfile(profile, {
      links: [
        { label: 'Rules & dues', url: 'https://example.org/rules' },
        { label: 'Nextdoor', url: 'https://nextdoor.com/neighborhood/elsewhere/' },
      ],
    });
    // Researched first, then the computed ones it does not repeat by label.
    expect(withLinks?.links?.map((l) => l.label)).toEqual([
      'Rules & dues',
      'Nextdoor',
      'Website',
      'Redfin',
      'Trulia',
      'Homes.com',
      'Property records',
      'Near ES',
      'Near MS',
      'Near HS',
      'School district',
      'Crime map',
      'FEMA flood map',
      'City of Alpharetta',
      'Fulton County',
      'Walk Score',
    ]);
    expect(mergeProfile(profile, null)).toBe(profile);
    expect(mergeProfile(null, { links: [] })).toBeNull();
  });
});

describe('small things', () => {
  it('measures miles and prints money short', () => {
    expect(milesBetween(34, -84, 34, -84)).toBe(0);
    expect(milesBetween(34, -84, 35, -84)).toBeCloseTo(69.1, 0);
    expect(usdShort(747000)).toBe('$747K');
    expect(usdShort(1538135)).toBe('$1.5M');
  });
});
