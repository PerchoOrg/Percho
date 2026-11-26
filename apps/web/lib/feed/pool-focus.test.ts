/**
 * The focused pool's narrowing (phase404). The reads are the route's; what is
 * tested here is the rule that decides what a focused pool may carry — above
 * all that a focus on a place we do not have carries nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  type PoolFocus,
  cityUnitId,
  focusCommunities,
  focusGeoUnits,
  listingPlaceFor,
} from './pool-focus';

const SUWANEE: PoolFocus = {
  kind: 'city',
  unitId: 'city:suwanee-ga',
  city: 'Suwanee',
  state: 'GA',
};
const EDINBURGH: PoolFocus = {
  kind: 'community',
  communityId: 'c-edinburgh',
  unitId: 'city:suwanee-ga',
};
const UNKNOWN: PoolFocus = { kind: 'unknown' };

const communities = [
  { id: 'c-edinburgh', geoUnitId: 'city:suwanee-ga' },
  { id: 'c-harvest-park', geoUnitId: 'city:suwanee-ga' },
  { id: 'c-windward', geoUnitId: 'city:alpharetta-ga' },
  { id: 'c-no-city' },
];
const units = [{ id: 'city:alpharetta-ga' }, { id: 'city:suwanee-ga' }];

describe('cityUnitId — the id city_geo_units builds in SQL', () => {
  it('lower-cases and hyphenates city and state', () => {
    expect(cityUnitId('Suwanee', 'GA')).toBe('city:suwanee-ga');
    expect(cityUnitId('Johns Creek', 'GA')).toBe('city:johns-creek-ga');
    expect(cityUnitId("Land O' Lakes", 'FL')).toBe('city:land-o-lakes-fl');
  });

  it('has no id for a row missing either half', () => {
    expect(cityUnitId(null, 'GA')).toBeUndefined();
    expect(cityUnitId('Suwanee', null)).toBeUndefined();
  });
});

describe('listingPlaceFor', () => {
  it('reads a city by its own name and state', () => {
    expect(listingPlaceFor(SUWANEE)).toEqual({ city: 'Suwanee', state: 'GA' });
  });

  it('reads a community by id', () => {
    expect(listingPlaceFor(EDINBURGH)).toEqual({ communityId: 'c-edinburgh' });
  });

  it('narrows nothing without a focus', () => {
    expect(listingPlaceFor(null)).toBeUndefined();
  });
});

describe('focusCommunities', () => {
  it('keeps only the focused city’s communities', () => {
    expect(focusCommunities(communities, SUWANEE).map((c) => c.id)).toEqual([
      'c-edinburgh',
      'c-harvest-park',
    ]);
  });

  it('keeps only the focused community', () => {
    expect(focusCommunities(communities, EDINBURGH).map((c) => c.id)).toEqual(['c-edinburgh']);
  });

  it('returns the pool untouched without a focus', () => {
    expect(focusCommunities(communities, null)).toBe(communities);
  });

  it('carries nothing for a place we do not have — never the whole pool', () => {
    expect(focusCommunities(communities, UNKNOWN)).toEqual([]);
  });
});

describe('focusGeoUnits', () => {
  it('keeps the focused city alone, so no other city’s film is in the deck', () => {
    expect(focusGeoUnits(units, SUWANEE)).toEqual([{ id: 'city:suwanee-ga' }]);
  });

  it('keeps the focused community’s own city', () => {
    expect(focusGeoUnits(units, EDINBURGH)).toEqual([{ id: 'city:suwanee-ga' }]);
  });

  it('keeps none for a community whose row names no city', () => {
    expect(focusGeoUnits(units, { kind: 'community', communityId: 'c-no-city' })).toEqual([]);
  });

  it('returns every unit without a focus, and none for an unknown one', () => {
    expect(focusGeoUnits(units, null)).toBe(units);
    expect(focusGeoUnits(units, UNKNOWN)).toEqual([]);
  });
});
