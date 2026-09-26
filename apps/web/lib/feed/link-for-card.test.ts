import { describe, expect, it } from 'vitest';
import { linkForCard } from './link-for-card';

describe('linkForCard', () => {
  it('routes agent listings by agent + listing slug', () => {
    expect(linkForCard({ agent: { slug: 'vivzh123' }, listing: { slug: '12-oak-st' } })).toBe(
      '/v/vivzh123/12-oak-st',
    );
  });

  it('routes Bridge listings under the /v/fmls/ page', () => {
    expect(
      linkForCard({
        agent: { slug: '', isExternal: true },
        listing: { slug: 'x', source: 'fmls_bridge', sourceId: 'd9e2c4cdf7a1658c5f66c85a4aafb02a' },
      }),
    ).toBe('/v/fmls/d9e2c4cdf7a1658c5f66c85a4aafb02a');
  });
});
