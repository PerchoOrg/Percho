import { describe, expect, it } from 'vitest';
import { parseMobileListingsFlag } from './mobile-listings';

const at = (qs: string) => parseMobileListingsFlag(new URL(`https://x.test/api/mobile/feed${qs}`));

describe('parseMobileListingsFlag', () => {
  it('turns listings off only for an explicit listings=0', () => {
    expect(at('?listings=0')).toBe(false);
  });

  it('keeps listings on without the flag — every build before iOS v1.0', () => {
    expect(at('')).toBe(true);
    expect(at('?listings=1')).toBe(true);
  });

  it('treats an unparseable value as the old behaviour, not as off', () => {
    expect(at('?listings=no')).toBe(true);
    expect(at('?listings=')).toBe(true);
  });
});
