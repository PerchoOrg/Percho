import { describe, expect, it } from 'vitest';
import { withoutReusedWhenFresh } from './shots';

const photo = (id: string, extra: { status?: string; usable?: boolean } = {}) => ({
  id,
  status: extra.status ?? 'approved',
  ai_tags: extra.usable === undefined ? {} : { usable: extra.usable },
});

describe('withoutReusedWhenFresh', () => {
  it("drops another film's frame when the place has a fresh one", () => {
    // St Marlo's Chattahoochee Pointe Park: one fresh photo, one from Aberdeen's film.
    const out = withoutReusedWhenFresh([photo('fresh'), photo('aberdeen')], new Set(['aberdeen']));
    expect(out.map((p) => p.id)).toEqual(['fresh']);
  });

  it('keeps reused frames when the place has nothing fresh', () => {
    const out = withoutReusedWhenFresh([photo('a'), photo('b')], new Set(['a', 'b']));
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('does not count a rejected or unusable photo as fresh', () => {
    const ranked = [
      photo('reused'),
      photo('bad', { status: 'rejected' }),
      photo('blur', { usable: false }),
    ];
    expect(withoutReusedWhenFresh(ranked, new Set(['reused'])).map((p) => p.id)).toContain(
      'reused',
    );
  });
});
