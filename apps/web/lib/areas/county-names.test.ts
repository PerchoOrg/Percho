import { describe, expect, it } from 'vitest';
import { namesCounty } from './county-names';

describe('namesCounty', () => {
  it('accepts the county named plainly', () => {
    expect(namesCounty('Cobb County', 'Cobb')).toBe(true);
    expect(namesCounty('  cobb county  ', 'Cobb')).toBe(true);
  });

  it('accepts an authority named for the county', () => {
    expect(namesCounty('Cherokee County Water and Sewerage Authority', 'Cherokee')).toBe(true);
    expect(namesCounty('Barrow County - Braselton', 'Barrow')).toBe(true);
  });

  it('rejects the CITY that shares the name', () => {
    // Every one of these is a real Georgia city in a different county, and a
    // prefix match takes it: Forsyth is in Monroe, Jackson in Butts, Douglas
    // in Coffee, Dawson in Terrell, Morgan in Calhoun. A draft of the water
    // import used a prefix match and would have written five wrong counties.
    for (const [city, county] of [
      ['Forsyth', 'Forsyth'],
      ['Jackson', 'Jackson'],
      ['Douglas', 'Douglas'],
      ['Dawson', 'Dawson'],
      ['Morgan', 'Morgan'],
    ]) {
      expect(namesCounty(city ?? '', county ?? ''), `${city} the city`).toBe(false);
    }
  });

  it('rejects a different county', () => {
    expect(namesCounty('Cobb County', 'Cherokee')).toBe(false);
    expect(namesCounty('Forsyth County', 'Fulton')).toBe(false);
  });

  it('does not match a longer word that merely starts the same', () => {
    expect(namesCounty('Cherokee Countyside Utility', 'Cherokee')).toBe(false);
    expect(namesCounty('Jacksonville County', 'Jackson')).toBe(false);
  });

  it('is not fooled by the county name appearing later in the label', () => {
    // "City of Forsyth" contains the word but does not name the county.
    expect(namesCounty('City of Forsyth', 'Forsyth')).toBe(false);
  });
});
