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

describe('joint city-county authorities', () => {
  it('accepts an authority that leads with the city name', () => {
    // 109,694 of Douglas County's 140,733 people. A leading-anchor rule
    // dropped this and the county kept an invented water figure.
    expect(namesCounty('Douglasville-Douglas County Water and Sewer Authority', 'Douglas')).toBe(
      true,
    );
    expect(namesCounty('Gainesville - Hall County', 'Hall')).toBe(true);
  });

  it('still rejects every city that shares a county name', () => {
    // The widening must not reopen the trap it was narrowed to close: none of
    // these contain the word "County" at all.
    for (const city of ['Forsyth', 'Jackson', 'Douglas', 'Dawson', 'Morgan', 'Douglasville']) {
      expect(namesCounty(city, city), city).toBe(false);
    }
    expect(namesCounty('Douglasville', 'Douglas')).toBe(false);
  });

  it('does not match a county name embedded in a longer word', () => {
    expect(namesCounty('Jacksonville County', 'Jackson')).toBe(false);
    expect(namesCounty('Cherokee Countyside Utility', 'Cherokee')).toBe(false);
  });

  it('does not attribute one county to another', () => {
    expect(namesCounty('Douglasville-Douglas County WSA', 'Coweta')).toBe(false);
  });
});
