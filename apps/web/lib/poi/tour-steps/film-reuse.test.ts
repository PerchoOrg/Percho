/**
 * Photos in other live films (phase366): Sims Lake Park's fountain was in
 * Aberdeen, Suwanee's city film and Wild Timber at once.
 */
import { describe, expect, it } from 'vitest';
import { photoIdsInOtherFilms } from './film-reuse';

const clips = (...ids: string[]) => ids.map((photo_id) => ({ photo_id }));

describe('photoIdsInOtherFilms', () => {
  it("collects other films' photos and leaves out the film being planned", () => {
    const ids = photoIdsInOtherFilms(
      [
        {
          owner: 'community:aberdeen',
          created_at: '2026-09-05',
          ordered_clips: clips('fountain', 'a'),
        },
        { owner: 'city:suwanee', created_at: '2026-11-18', ordered_clips: clips('fountain', 'b') },
        {
          owner: 'community:wild-timber',
          created_at: '2026-11-21',
          ordered_clips: clips('fountain', 'c'),
        },
      ],
      'community:wild-timber',
    );
    expect([...ids].sort()).toEqual(['a', 'b', 'fountain']);
  });

  it("reads only each owner's newest cut", () => {
    const ids = photoIdsInOtherFilms(
      [
        { owner: 'community:aberdeen', created_at: '2026-09-01', ordered_clips: clips('old') },
        { owner: 'community:aberdeen', created_at: '2026-09-05', ordered_clips: clips('new') },
      ],
      null,
    );
    expect([...ids]).toEqual(['new']);
  });

  it('skips malformed clip lists', () => {
    expect(
      photoIdsInOtherFilms([{ owner: 'city:x', created_at: '1', ordered_clips: null }], null).size,
    ).toBe(0);
  });
});
