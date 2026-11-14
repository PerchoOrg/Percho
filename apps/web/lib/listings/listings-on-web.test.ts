import { describe, expect, it } from 'vitest';
import { isListingRoute } from './listings-on-web';

describe('isListingRoute', () => {
  it('matches the buyer-facing listing routes', () => {
    for (const path of [
      '/browse',
      '/browse/feed',
      '/browse/nearby',
      '/nearby',
      '/v/vivian/123-main-st',
      '/v/fmls/abc',
      '/a/vivian',
    ]) {
      expect(isListingRoute(path), path).toBe(true);
    }
  });

  it('leaves community, account and agent-dashboard routes alone', () => {
    for (const path of [
      '/',
      '/communities',
      '/communities/nearby',
      '/c/windward',
      '/c/windward/feed',
      '/saved',
      '/search',
      '/agents',
      '/about',
      '/dashboard',
      '/dashboard/listings/1/preview',
      '/api/mobile/feed',
      '/browser',
      '/value',
    ]) {
      expect(isListingRoute(path), path).toBe(false);
    }
  });
});
