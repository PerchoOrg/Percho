import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeRedirectPath('/dashboard/leads?x=1#top')).toBe('/dashboard/leads?x=1#top');
  });

  it('falls back on missing or relative input', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath(undefined, '/browse')).toBe('/browse');
    expect(safeRedirectPath('dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('https://evil.com')).toBe('/dashboard');
  });

  it('rejects every spelling that leaves the origin', () => {
    for (const raw of [
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\\/evil.com',
    ]) {
      expect(safeRedirectPath(raw)).toBe('/dashboard');
    }
  });
});
