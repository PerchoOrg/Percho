/**
 * The community-naming rules, as the cases that produced them.
 *
 * Every string below is a real row from the county plat layers or the live
 * `communities` table (phase191–193), not an invented example — which is the
 * point: these tests are the record of what the data actually looks like, so
 * the next import that widens a rule can see what it must not break.
 */

import { describe, expect, it } from 'vitest';
import {
  cleanName,
  isPodOf,
  isSamePlace,
  normalizeName,
  sayable,
  squash,
  titleCaseName,
  unwrap,
} from './naming';

describe('cleanName — phases', () => {
  /** Owner, 2026-09-07: 「我不要期数」. Eleven plats, one community. */
  it('strips the phase however the recorder joined it to the number', () => {
    for (const raw of [
      'CREEK PARK HILLS UNIT 9',
      'CREEK PARK HILLS S/D UNIT 5',
      'CREEK PARK HILLS S/D SEC.3',
      'CREEK PARK HILLS UNIT-1',
      'CREEK PARK HILLS UNIT#1',
      'CREEK PARK HILLS PHASES 1,2,3',
      'CREEK PARK HILLS UNIT 2,',
      'CREEK PARK HILLS REVISION 3',
    ]) {
      expect(cleanName(raw)).toBe('CREEK PARK HILLS');
    }
  });

  it('strips a bare trailing roman numeral, which is always a phase here', () => {
    expect(cleanName('OAKS ON WOODLAWN II')).toBe('OAKS ON WOODLAWN');
  });

  /**
   * A bare trailing DIGIT is deliberately kept. Stripping it would merge two
   * real communities, and a wrong merge is worse than an ugly name.
   */
  it('keeps a bare trailing digit', () => {
    expect(cleanName('BURDETT RIDGE 4')).toBe('BURDETT RIDGE 4');
  });

  it('handles two suffixes on one name', () => {
    expect(cleanName('CASTLE DOWNS UNIT-1 PHASE-3')).toBe('CASTLE DOWNS');
  });
});

describe('cleanName — places nobody lives', () => {
  it('drops commercial, office and rental plats a land-use code misses', () => {
    for (const raw of [
      'GWINNETT PLACE COMMERCIAL CENTER',
      'KILLIAN HILL OFFICE CONDOMINIUMS',
      'NORCROSS SOUTHERN INDUSTRIAL DISTRICT',
      'PARK AT KENNESAW APTS',
      'PROPERTY OF FIRST NATIONAL BANK',
      'AWESOME HOMES INC',
      'GWINRAY LP',
      '1ST FLOOR',
    ]) {
      expect(cleanName(raw)).toBeNull();
    }
  });

  /**
   * A middle initial — letter, full stop, SPACE — is an owner splitting one
   * parcel. "N.DRUID WOODS" has no space after its full stop, which is what
   * separates an abbreviation from an initial, and it must survive.
   */
  it('drops an owner plat but keeps an abbreviated place name', () => {
    expect(cleanName('ROBERT Q. CASSELS')).toBeNull();
    expect(cleanName('GARY E. & TERESAM. KENNEDY')).toBeNull();
    expect(cleanName('A.H.GUY')).toBeNull();
    expect(cleanName('N.DRUID WOODS')).toBe('N.DRUID WOODS');
  });

  it("drops the recorder's vocabulary from a real name", () => {
    expect(cleanName('APPLE VALLEY CONDOMINIUMS')).toBe('APPLE VALLEY');
    expect(cleanName('GLENLEAF A CONDOMINIUM')).toBe('GLENLEAF');
    expect(cleanName('APALACHEE HILLS SUBDIVISION')).toBe('APALACHEE HILLS');
    expect(cleanName('NORTH DRUID HILLS S/D')).toBe('NORTH DRUID HILLS');
  });
});

describe('unwrap + isPodOf — a slice named after the place it sits in', () => {
  /**
   * The case that set the rule: `2090 Lake Windward Drive` sits in an
   * 11.5-acre plat called "Neighborhoods of Windward Cove", inside the
   * 1,328-acre "Windward". Its own MLS record says Windward.
   */
  it('folds a pod into the community its name points at', () => {
    const inner = unwrap('NEIGHBORHOODS OF WINDWARD COVE');
    expect(inner).toBe('WINDWARD COVE');
    expect(isPodOf(inner as string, 'Windward')).toBe(true);
  });

  it('matches on a word boundary, not a prefix of a word', () => {
    expect(isPodOf('WINDWARD COVE', 'Wind')).toBe(false);
    expect(isPodOf('WINDWARD COVE', 'Windward Cove')).toBe(true);
  });

  it('reads a trailing wrapper too', () => {
    expect(unwrap('SWEETWATER LANDING TOWNHOMES')).toBe('SWEETWATER LANDING');
  });

  /** No wrapper, no parent — "Reverie on Cumberland" is its own place. */
  it('returns null for a name that wraps nothing', () => {
    expect(unwrap('REVERIE ON CUMBERLAND')).toBeNull();
    expect(unwrap('BERKELEY PARK')).toBeNull();
  });
});

describe('isSamePlace — the same ground recorded twice', () => {
  it('matches through spacing and punctuation', () => {
    expect(isSamePlace('SUNVALLEY ESTATES', 'Sun Valley Estates', 1.57)).toBe(true);
    expect(isSamePlace('NORTHFARM', 'North Farm', 0.93)).toBe(true);
    expect(squash('St. Ives')).toBe('stives');
  });

  it('matches a prefix only when the two shapes are comparable', () => {
    // "Canterbury Farms" is 83% of "Canterbury" — one place, two records.
    expect(isSamePlace('CANTERBURY FARMS', 'Canterbury', 0.83)).toBe(true);
    // A real subdivision nested inside another is a fraction of it.
    expect(isSamePlace('WINDWARD POINTE', 'Windward', 0.01)).toBe(false);
  });

  it('is conservative with no geometry to compare', () => {
    expect(isSamePlace('NORTHFARM', 'North Farm', 1)).toBe(true);
    expect(isSamePlace('CANTERBURY FARMS', 'Canterbury', 1)).toBe(true);
    expect(isSamePlace('OAK HARBOR', 'Oak Grove', 1)).toBe(false);
  });
});

describe('sayable — which spelling survives a merge', () => {
  it('prefers the spelling that kept its spaces', () => {
    expect(sayable('Sun Valley Estates', 'Sunvalley Estates')).toBe('Sun Valley Estates');
    expect(sayable('River Falls', 'Riverfalls')).toBe('River Falls');
  });

  it('prefers the fuller name at equal word counts', () => {
    expect(sayable('Canterbury', 'Canterbury Farms')).toBe('Canterbury Farms');
    expect(sayable('St. Ives', 'St. Ives Country Club')).toBe('St. Ives Country Club');
  });
});

describe('presentation', () => {
  it('title-cases without capitalising the joining words', () => {
    expect(titleCaseName('SWEET BOTTOM PLANTATION')).toBe('Sweet Bottom Plantation');
    expect(titleCaseName('HIGHLANDS AT BRIDGEGATE')).toBe('Highlands at Bridgegate');
    expect(titleCaseName('THE ENCLAVE AT POST OAK')).toBe('The Enclave at Post Oak');
  });

  it('normalises spacing and case for comparison', () => {
    expect(normalizeName('  Wildcliff   Estates  ')).toBe('WILDCLIFF ESTATES');
  });
});
