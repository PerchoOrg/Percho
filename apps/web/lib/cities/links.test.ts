import { describe, expect, it } from 'vitest';
import { cityLinks, citySafety } from './links';

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
      'Reddit',
      'YouTube',
    ]);
  });
});

describe('citySafety', () => {
  it('states the hospital and the fire stations, and nothing about crime', () => {
    const rows = citySafety('cumming-ga')?.rows ?? [];
    expect(rows.map((r) => r.label)).toEqual(['Hospital', 'Fire stations']);
    expect(rows[0]?.note).toMatch(/ mi$/);
    expect(rows[1]?.name).toMatch(/^\d+ within 5 miles$/);
    expect(JSON.stringify(rows)).not.toMatch(/crime/i);
    expect(citySafety('nowhere-ga')).toBeUndefined();
  });
});
