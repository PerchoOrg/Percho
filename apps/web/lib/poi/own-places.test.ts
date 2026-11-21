/**
 * A community's own places on Google (phase366). Cases are the live results
 * of 2026-11-21 for Wild Timber, Windermere and Sugarloaf Country Club.
 */
import { describe, expect, it } from 'vitest';
import type { PlaceResult } from './google-places';
import { carriesCommunityName, isOwnPlace } from './own-places';

const WILD_TIMBER = { lat: 34.112867, lng: -84.093641 };

const place = (over: Partial<PlaceResult> = {}): PlaceResult => ({
  id: 'p1',
  displayName: { text: 'Wild Timber Hoa Cabin Club' },
  primaryType: 'association_or_organization',
  types: ['association_or_organization', 'point_of_interest', 'establishment'],
  location: { latitude: 34.1135, longitude: -84.0921 },
  photos: [{ name: 'places/p1/photos/a' }],
  ...over,
});

describe('carriesCommunityName', () => {
  it('needs every distinctive word', () => {
    expect(carriesCommunityName('Wild Timber', 'Wild Timber Hoa Cabin Club')).toBe(true);
    expect(carriesCommunityName('Wild Timber', 'Timber Ridge Pool')).toBe(false);
  });

  it('ignores generic words in the community name', () => {
    expect(carriesCommunityName('Sugarloaf Country Club', 'TPC Sugarloaf')).toBe(true);
    expect(carriesCommunityName('Windermere', 'Windermere Pool')).toBe(true);
  });

  it('wants the whole name when every word is generic', () => {
    expect(carriesCommunityName('The Commons', 'The Commons Pool')).toBe(true);
    expect(carriesCommunityName('The Commons', 'Peachtree Commons')).toBe(false);
  });
});

describe('isOwnPlace', () => {
  it('takes the HOA clubhouse', () => {
    expect(isOwnPlace('Wild Timber', WILD_TIMBER, place())).toBe(true);
  });

  it('refuses the street named after the community', () => {
    expect(
      isOwnPlace(
        'Wild Timber',
        WILD_TIMBER,
        place({
          displayName: { text: 'Wild Timber Road' },
          primaryType: undefined,
          types: ['route'],
        }),
      ),
    ).toBe(false);
  });

  it('refuses a business that borrows the name', () => {
    expect(
      isOwnPlace(
        'Wild Timber',
        WILD_TIMBER,
        place({
          displayName: { text: 'Wild Timber Realty' },
          primaryType: 'real_estate_agency',
          types: ['real_estate_agency'],
        }),
      ),
    ).toBe(false);
  });

  it('refuses a place without photos or too far away', () => {
    expect(isOwnPlace('Wild Timber', WILD_TIMBER, place({ photos: [] }))).toBe(false);
    expect(
      isOwnPlace(
        'Wild Timber',
        WILD_TIMBER,
        place({ location: { latitude: 34.14, longitude: -84.09 } }),
      ),
    ).toBe(false);
  });
});
