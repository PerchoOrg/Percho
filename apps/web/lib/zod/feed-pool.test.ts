import { describe, expect, it } from 'vitest';
import { parseFeedPoolQuery } from './feed-pool';

const at = (qs: string) => parseFeedPoolQuery(new URL(`https://x.test/api/mobile/feed${qs}`));

describe('parseFeedPoolQuery — the focus params (phase404)', () => {
  it('reads a city unit id and a community slug', () => {
    expect(at('?city=city:suwanee-ga').city).toBe('city:suwanee-ga');
    expect(at('?community=lost-mountain-estates').community).toBe('lost-mountain-estates');
  });

  it('names no focus when neither is sent', () => {
    const q = at('?stage=4');
    expect(q.city).toBeUndefined();
    expect(q.community).toBeUndefined();
  });

  it('reads anything that is not an id or a slug as no focus', () => {
    expect(at('?city=Suwanee').city).toBeUndefined();
    expect(at('?city=city:Suwanee,GA').city).toBeUndefined();
    expect(at('?city=').city).toBeUndefined();
    expect(at('?community=windward)or(status.eq.archived').community).toBeUndefined();
    expect(at('?community=Wind%20ward').community).toBeUndefined();
  });

  it('leaves the rest of the query as it was', () => {
    const q = at('?stage=4&limit=12&videosOnly=1&city=city:suwanee-ga');
    expect(q).toMatchObject({ stage: 4, offset: 0, limit: 12, videosOnly: true });
  });
});
