import type { CommunityProfile } from '@percho/shared/community-profile';
import { describe, expect, it } from 'vitest';
import { cityGlance, communityGlance, fromDowntown } from './glance';

const school = (label: string, rank: string, of: string, percentile: number) => ({
  group: 'Schools',
  label,
  rank,
  of,
  percentile,
});

/** Windward's researched profile, the parts a glance reads. */
const windward = {
  asOf: '2026-11-15',
  verdict: { good: [], watch: [] },
  ranks: {
    rows: [
      school('Elementary', '#3 · #6', 'of 1,220 in GA', 99.6),
      school('Middle', '#7', 'of 472 in GA', 98.7),
      school('High', '#31', 'of 443 in GA', 93.2),
      { group: 'Homes', label: 'Home value', rank: '#7', of: 'of 203 metro ZIPs', percentile: 97 },
    ],
  },
  homeValue: {
    area: 'ZIP 30005',
    display: '$747K',
    change: '+60% since 2020',
    headline: 'Up 60% since 2020.',
    baseline: 'Metro Atlanta',
    series: [],
  },
} as unknown as CommunityProfile;

const at = { lat: 34.097563, lng: -84.238572 };

describe('fromDowntown', () => {
  it('measures a straight line and names the side of the city', () => {
    const windwardAt = fromDowntown(at);
    expect(Math.round(windwardAt.miles)).toBe(25);
    expect(windwardAt.side).toBe('north');
    // Buford sits up I-85, not up GA-400.
    expect(fromDowntown({ lat: 34.078223, lng: -83.955384 }).side).toBe('northeast');
    expect(fromDowntown({ lat: 33.45, lng: -84.39 }).side).toBe('south');
  });
});

describe('communityGlance', () => {
  it('names the place and prints the three figures the Explore page holds', () => {
    expect(
      communityGlance({ city: 'Alpharetta', county: 'Fulton', ...at, profile: windward }),
    ).toEqual({
      place: { lead: 'Alpharetta', rest: 'Fulton County' },
      cells: [
        { value: '$747K', label: 'ZIP 30005 homes', topic: 'potential' },
        // #6 of 1,220 rounds up to 1%; #31 of 443 to 7% — the Explore tile's own rounding.
        { value: 'Top 1–7%', label: 'schools nearby', topic: 'schools' },
        { value: '25 mi', label: 'north of Atlanta', topic: 'convenience' },
      ],
    });
  });

  it('leaves out what it has no figure for', () => {
    const glance = communityGlance({ city: 'Duluth', county: null, profile: null });
    expect(glance).toEqual({ place: { lead: 'Duluth' }, cells: [] });
  });

  it('prints one share when every level stands the same, and one school in the singular', () => {
    const one = { ...windward, ranks: { rows: [school('High', '#31', 'of 443 in GA', 93.2)] } };
    expect(communityGlance({ city: 'Alpharetta', profile: one })?.cells[1]).toEqual({
      value: 'Top 7%',
      label: 'school nearby',
      topic: 'schools',
    });
  });

  it('says no distance for a place that is downtown', () => {
    const glance = communityGlance({ city: 'Atlanta', lat: 33.757, lng: -84.39, profile: null });
    expect(glance?.cells).toEqual([]);
  });

  it('is nothing without a city to lead with', () => {
    expect(communityGlance({ city: '', profile: windward })).toBeUndefined();
  });
});

type CityProfile = NonNullable<Parameters<typeof cityGlance>[0]['profile']>;

const compareRow = (label: string, value: number) => ({
  label,
  city: { value, display: `$${value.toLocaleString('en-US')}` },
  state: { value: 300000, display: '$300,000' },
  takeaway: '',
});

const graduation = (label: string, pct: number, baseline?: true) => ({
  label,
  pct,
  display: `${pct}%`,
  ...(baseline ? { baseline } : {}),
});

/** Cumming's page, the parts a glance reads; `over` swaps a part. */
function cityProfile(over: Partial<CityProfile> = {}): CityProfile {
  return {
    locationNote: '39 mi north of downtown Atlanta',
    compare: {
      against: 'Georgia',
      rows: [
        compareRow('Median household income · county', 143784),
        compareRow('Median home value · county', 550400),
        compareRow('Median home value · inside the city', 382900),
      ],
      source: { name: 'U.S. Census Bureau' },
    },
    education: {
      schools: [],
      measure: 'Graduate in 4 years · class of 2026',
      rows: [graduation('Forsyth County Schools', 97.5), graduation('Georgia', 88.5, true)],
      note: 'All are Forsyth County Schools.',
    },
    gettingAround: [
      {
        label: 'Downtown Atlanta · 39 mi',
        value: '~52 min · 83 at rush',
        minutes: { min: 52, max: 83 },
      },
      { label: 'Hartsfield-Jackson · 47 mi', value: '56–86 min', minutes: { min: 56, max: 86 } },
    ],
    ...over,
  };
}

describe('cityGlance', () => {
  const place = { name: 'Cumming', county: 'Forsyth', lat: 34.2073, lng: -84.1402 };

  it("leads with the county and prints the figures the city's own page shows", () => {
    expect(cityGlance({ ...place, profile: cityProfile() })).toEqual({
      place: { lead: 'Forsyth County', rest: 'north of Atlanta' },
      cells: [
        // The page's first home value row, and whose it is.
        { value: '$550K', label: 'median home · county', topic: 'cost' },
        { value: '97.5%', label: 'graduate in 4 years', topic: 'schools' },
        // Off-peak to rush, as the page's Convenience tile prints it.
        { value: '52–83 min', label: '39 mi to downtown', topic: 'convenience' },
      ],
    });
  });

  it("names a city's own median plainly", () => {
    const alpharetta = cityProfile({
      compare: {
        ...cityProfile().compare,
        rows: [compareRow('Median home value', 649000)],
      },
    });
    expect(cityGlance({ ...place, profile: alpharetta })?.cells[0]).toEqual({
      value: '$649K',
      label: 'median home value',
      topic: 'cost',
    });
  });

  it('prints several high schools lowest to highest, not the best alone', () => {
    const suwanee = cityProfile({
      education: {
        ...cityProfile().education,
        rows: [
          graduation('North Gwinnett HS', 97.4),
          graduation('Peachtree Ridge HS', 94.8),
          graduation('Gwinnett district', 85.4, true),
        ],
      },
    });
    expect(cityGlance({ ...place, profile: suwanee })?.cells[1]).toEqual({
      value: '95–97%',
      label: 'graduate in 4 years',
      topic: 'schools',
    });
  });

  it('has two figures for a city whose page prices no home', () => {
    const bare = cityProfile({ compare: { ...cityProfile().compare, rows: [] } });
    expect(cityGlance({ ...place, profile: bare })?.cells).toHaveLength(2);
  });

  it('measures the side itself for a city with no profile', () => {
    // 24° east of north: the compass says northeast where the page says north.
    expect(cityGlance({ ...place, profile: null })).toEqual({
      place: { lead: 'Forsyth County', rest: 'northeast of Atlanta' },
      cells: [],
    });
  });
});
