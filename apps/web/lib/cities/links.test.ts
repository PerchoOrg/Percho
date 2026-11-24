import { describe, expect, it } from 'vitest';
import { cityForecast } from './forecasts';
import {
  articleLinks,
  cityEveryday,
  cityHazards,
  cityLinks,
  citySchools,
  schoolSite,
} from './links';

describe('cityLinks', () => {
  const links = cityLinks({
    name: 'Johns Creek',
    county: 'Fulton',
    lat: 34.06,
    lng: -84.17,
    website: 'https://johnscreekga.gov',
  });
  const at = (label: string) => links.find((l) => l.label === label)?.url;

  it('puts every link under a heading', () => {
    expect([...new Set(links.map((l) => l.group))]).toEqual([
      'City',
      'Homes',
      'Schools',
      'Safety',
      'Community',
    ]);
  });

  it("addresses each site to the city, by its own name or Redfin's id", () => {
    // "City of Johns Creek" is past the pill's 18 characters.
    expect(at('Johns Creek')).toBe('https://johnscreekga.gov');
    expect(at('Fulton County')).toBe('https://www.fultoncountyga.gov/');
    expect(at('Wikipedia')).toBe('https://en.wikipedia.org/wiki/Johns_Creek%2C_Georgia');
    expect(at('Redfin')).toBe('https://www.redfin.com/city/33537/GA/Johns-Creek');
    expect(at('Trulia')).toBe('https://www.trulia.com/GA/Johns_Creek/');
    expect(at('Homes.com')).toBe('https://www.homes.com/johns-creek-ga/');
    expect(at('Homes on Zillow')).toBe('https://www.zillow.com/homes/Johns-Creek-GA_rb/');
    expect(at('School district')).toBe('https://www.fultonschools.org/');
  });

  it('links crime out to the agencies’ map, and opens FEMA’s on the city', () => {
    expect(at('Crime map')).toBe('https://communitycrimemap.com/?address=Johns%20Creek%2C%20GA');
    expect(at('FEMA flood map')).toContain('center=-84.17,34.06&level=13');
  });

  it('leaves out what it has no verified page for', () => {
    const bare = cityLinks({ name: 'Nowhere', county: null, lat: null, lng: null, website: null });
    expect(bare.map((l) => l.label)).toEqual([
      'Wikipedia',
      'Google Maps',
      'Homes on Zillow',
      'Crime map',
      'FEMA Risk Index',
      'Reddit',
      'YouTube',
    ]);
  });

  it('links what residents wrote on Niche, by city and county', () => {
    expect(at('Niche reviews')).toBe('https://www.niche.com/places-to-live/johns-creek-fulton-ga/');
  });
});

describe('articleLinks', () => {
  const src = (name: string, url?: string) => ({ name, ...(url ? { url } : {}) });
  it('takes the pieces the profile cites, and no figures, official pages or school rankings', () => {
    const links = articleLinks({
      rankings: [
        {
          rank: '#1',
          scope: '',
          title: 'Best Places to Live',
          detail: '',
          source: src('Fortune', 'https://fortune.com/a'),
        },
        {
          rank: '#6',
          scope: '',
          title: 'Daves Creek Elementary School',
          detail: '',
          source: src('U.S. News', 'https://usnews.com/b'),
        },
      ],
      education: {
        schools: [
          { level: 'elementary', name: 'Daves Creek Elementary', detail: '', source: src('x') },
        ],
        measure: '',
        rows: [],
        note: '',
      },
      sources: [
        src('Wikipedia — Cumming, Georgia', 'https://en.wikipedia.org/wiki/Cumming'),
        src('U.S. Census Bureau ACS — Cumming', 'https://census.gov/x'),
        src('AJC — Inside the Alpha Loop', 'https://ajc.com/c'),
        src('Forsyth County News — Overlook groundbreaking', 'http://insecure.example/d'),
        src('Fortune — Best Places to Live for Families 2024', 'https://fortune.com/a'),
        src('Drive times: Google Routes'),
      ],
    });
    expect(links).toEqual([
      { group: 'Articles', label: 'Fortune: Best Places to Live', url: 'https://fortune.com/a' },
      { group: 'Articles', label: 'AJC — Inside the Alpha Loop', url: 'https://ajc.com/c' },
    ]);
  });
});

describe('citySchools', () => {
  it('lists a city’s schools best first within each level', () => {
    const list = citySchools('cumming-ga') ?? [];
    expect(list.length).toBeGreaterThan(10);
    const elementary = list.filter((s) => s.level === 'elementary').map((s) => s.share);
    expect(elementary).toEqual([...elementary].sort((a, b) => a - b));
    expect(list.every((s) => s.share >= 1 && s.share <= 100)).toBe(true);
    expect(citySchools('nowhere-ga')).toBeUndefined();
  });
});

describe('cityHazards', () => {
  const RATINGS = [
    'Very Low',
    'Relatively Low',
    'Relatively Moderate',
    'Relatively High',
    'Very High',
  ];

  it('rates the composite and each hazard in FEMA’s words, highest first, and nothing about crime', () => {
    const h = cityHazards('duluth-ga');
    expect(RATINGS).toContain(h?.overall);
    const rows = h?.rows ?? [];
    expect(rows.map((r) => r.label)).toContain('Flood');
    const levels = rows.map((r) => RATINGS.indexOf(r.rating));
    expect(levels.every((l) => l >= 0)).toBe(true);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(h?.tracts).toBeGreaterThan(5);
    expect(JSON.stringify(h)).not.toMatch(/crime|police/i);
    expect(cityHazards('nowhere-ga')).toBeUndefined();
  });
});

describe('cityEveryday', () => {
  it('lists everyday places by kind, nearest first, groceries leading and the hospital last', () => {
    const kinds = cityEveryday('duluth-ga') ?? [];
    expect(kinds[0]?.kind).toBe('Groceries');
    expect(kinds[kinds.length - 1]?.kind).toBe('Hospital');
    for (const k of kinds) {
      expect(k.places.length).toBeGreaterThan(0);
      expect(k.places.length).toBeLessThanOrEqual(5);
      const miles = k.places.map((p) => p.miles);
      expect(miles).toEqual([...miles].sort((a, b) => a - b));
      expect(new Set(k.places.map((p) => p.name)).size).toBe(k.places.length);
    }
    expect(cityEveryday('nowhere-ga')).toBeUndefined();
  });
});

describe('schoolSite', () => {
  it('finds a school by its name with or without "School"', () => {
    const site = schoolSite('duluth-ga', 'Peachtree Ridge High');
    expect(site).toMatch(/^https:\/\//);
    expect(schoolSite('duluth-ga', 'Peachtree Ridge High School')).toBe(site);
    expect(schoolSite('duluth-ga', 'No Such Academy')).toBeUndefined();
  });
});

describe('cityForecast', () => {
  it("gives the county's published 2050 forecast, named as the county's", () => {
    expect(cityForecast('Forsyth')).toMatchObject({
      area: 'Forsyth County',
      year: 2050,
      value: 450124,
      baseValue: 251283,
      takeaway: '+79% from 2020',
    });
    expect(cityForecast('Gwinnett')?.takeaway).toBe('+25% from 2020');
    expect(cityForecast('Fulton')?.takeaway).toBe('+24% from 2020');
    expect(cityForecast('Hall')).toBeUndefined();
    expect(cityForecast(null)).toBeUndefined();
  });
});
