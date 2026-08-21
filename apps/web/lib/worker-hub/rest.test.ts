import { describe, expect, it } from 'vitest';
import { parseContentRange } from './rest';

describe('parseContentRange', () => {
  it('reads the total after the slash', () => {
    expect(parseContentRange('0-24/1337')).toBe(1337);
  });
  it('is zero for an empty result', () => {
    expect(parseContentRange('*/0')).toBe(0);
  });
  it('is zero when PostgREST did not count', () => {
    expect(parseContentRange('0-24/*')).toBe(0);
    expect(parseContentRange(null)).toBe(0);
  });
});
