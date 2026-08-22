import { describe, expect, it } from 'vitest';
import { communitySearchFilter } from './admin-search';

describe('communitySearchFilter', () => {
  it('matches name or city, unwrapped so .or() can add the only parens', () => {
    expect(communitySearchFilter('bellmoore')).toBe(
      'name.ilike."%bellmoore%",city.ilike."%bellmoore%"',
    );
    expect(communitySearchFilter('bellmoore').startsWith('(')).toBe(false);
  });

  it('keeps commas and parens inside the quoted value', () => {
    const f = communitySearchFilter('Suwanee, GA (north)');
    expect(f).toBe('name.ilike."%Suwanee, GA (north)%",city.ilike."%Suwanee, GA (north)%"');
  });

  it('escapes backslashes and double quotes', () => {
    expect(communitySearchFilter('a"b\\c')).toBe(
      'name.ilike."%a\\"b\\\\c%",city.ilike."%a\\"b\\\\c%"',
    );
  });
});
