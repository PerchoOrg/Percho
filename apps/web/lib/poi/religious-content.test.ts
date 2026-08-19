import { describe, expect, it } from 'vitest';
import { isReligiousPlace } from './religious-content';

describe('isReligiousPlace', () => {
  it('catches the temple that reached Aberdeen', () => {
    // NASSTA arrived as a name the research agent proposed, with Google
    // returning it under a non-religious primary type.
    expect(
      isReligiousPlace({
        name: 'North America Shirdi Sai Temple Of Atlanta (NASSTA)',
        bucket: 'faith',
        primaryType: 'tourist_attraction',
        types: ['tourist_attraction', 'point_of_interest'],
      }),
    ).toBe(true);
  });

  it('catches a place by Google type even when the name is secular', () => {
    expect(isReligiousPlace({ name: 'Riverstone Center', primaryType: 'church' })).toBe(true);
    expect(isReligiousPlace({ name: 'Community Hall', types: ['place_of_worship'] })).toBe(true);
  });

  it('catches a place by name even when Google has no religious type', () => {
    for (const name of [
      'St. Brigid Catholic Church',
      'Masjid Al-Farooq',
      'Temple Kol Emeth',
      'Guru Nanak Gurdwara',
      'Holy Trinity Chapel',
    ]) {
      expect(isReligiousPlace({ name, primaryType: 'point_of_interest' })).toBe(true);
    }
  });

  it('catches anything still tagged into the faith bucket', () => {
    expect(isReligiousPlace({ name: 'Unnamed', bucket: 'faith' })).toBe(true);
  });

  it('leaves ordinary places alone', () => {
    for (const name of [
      'Sharon Elementary School',
      'Publix Super Market at The Village Shoppes at Windermere',
      'Sims Lake Park',
      'MOTW Coffee and Pastries',
      'Saints Row Bistro', // the one street-name exception the pattern allows
    ]) {
      expect(isReligiousPlace({ name, primaryType: 'point_of_interest' })).toBe(false);
    }
  });

  it('errs toward exclusion on an ambiguous name', () => {
    // "Temple Coffee" loses one candidate out of a dozen; a missed place of
    // worship is a fair-housing exposure. The trade is deliberate.
    expect(isReligiousPlace({ name: 'Temple Coffee Roasters' })).toBe(true);
  });
});
