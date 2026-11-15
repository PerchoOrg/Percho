import type { CityFilmLine, CityProfile } from '@/lib/zod/city-profile';
import { describe, expect, it } from 'vitest';
import { type FilmPhoto, buildCityFilm, lineSeconds, spokenWords } from './film';

const photo = (id: string, over: Partial<FilmPhoto> = {}): FilmPhoto => ({
  id: `${id}-0000-0000-0000-000000000000`,
  poiId: `poi-${id}`,
  poiName: `Place ${id}`,
  bucket: 'outdoor',
  width: 4032,
  height: 3024,
  seedanceReady: false,
  ...over,
});

const photos = [
  photo('aaaaaaaa'),
  photo('bbbbbbbb'),
  photo('cccccccc', { width: 3000, height: 4000 }),
  photo('dddddddd', { seedanceReady: true }),
  photo('eeeeeeee'),
  photo('ffffffff'),
];

/** Only `film` is read by the cut. */
const profileOf = (lines: CityFilmLine[]) => ({ film: { lines } }) as unknown as CityProfile;

const eight = 'A greenway follows the creek through the town.'; // 8 words

describe('spokenWords', () => {
  it('counts a figure as the two or three words it is aloud', () => {
    expect(spokenWords('It began in 1871, as a stop on the railroad.')).toBe(9 + 2.5);
  });
});

describe('lineSeconds', () => {
  it('gives every clip its crossfade on top of the speech and the air', () => {
    expect(lineSeconds(eight, 1)).toBeCloseTo(8 / 2.3 + 0.6 + 0.5, 5);
    expect(lineSeconds(eight, 3) - lineSeconds(eight, 1)).toBeCloseTo(1, 5);
  });
});

describe('buildCityFilm', () => {
  it('cuts each line over its own photos, in order, and anchors the line to its first clip', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        {
          say: eight,
          shots: [
            { photo: 'bbbbbbbb', weight: 2 },
            { photo: 'cccccccc', weight: 1 },
          ],
        },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
      ]),
      photos,
    });
    expect(film.problems).toEqual([]);
    expect(film.shots.map((s) => s.photo_id.slice(0, 8))).toEqual([
      'aaaaaaaa',
      'bbbbbbbb',
      'cccccccc',
      'eeeeeeee',
      'ffffffff',
    ]);
    expect(film.segments.map((s) => [s.startClip, s.endClip])).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  it('gives a line enough clip to be spoken in, whatever the rounding', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        {
          say: `${eight} ${eight}`,
          shots: [
            { photo: 'bbbbbbbb', weight: 9 },
            { photo: 'cccccccc', weight: 5 },
            { photo: 'eeeeeeee', weight: 6 },
          ],
        },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
        { say: eight, shots: [{ photo: 'dddddddd' }] },
      ]),
      photos,
    });
    const second = film.shots.slice(1, 4);
    const total = second.reduce((a, s) => a + s.duration_s, 0);
    expect(total).toBeGreaterThanOrEqual(lineSeconds(`${eight} ${eight}`, 3));
    expect(total).toBeLessThan(lineSeconds(`${eight} ${eight}`, 3) + 1);
    expect(second.every((s) => s.duration_s >= 2.5)).toBe(true);
    // Weighted: the heaviest shot is the longest.
    expect(second[0]?.duration_s).toBeGreaterThan(second[1]?.duration_s ?? 0);
  });

  it('refuses a line whose photo the city does not hold — no related picture stands in', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: 'The farmers market takes over Town Center.', shots: [{ photo: '99999999' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
      ]),
      photos,
    });
    expect(film.problems).toHaveLength(1);
    expect(film.problems[0]).toContain('line 2');
    expect(film.problems[0]).toContain('99999999');
    // The line is not cut at all: three lines, three shots.
    expect(film.shots).toHaveLength(3);
    expect(film.segments).toHaveLength(3);
  });

  it('shows a picture once', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
      ]),
      photos,
    });
    expect(film.problems).toEqual([
      'line 3: photo aaaaaaaa is already under line 1 — a picture is shown once',
    ]);
  });

  it('plays a photo with a paid Seedance clip as that clip — four seconds — and shares the rest', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: `${eight} ${eight}`, shots: [{ photo: 'bbbbbbbb' }, { photo: 'dddddddd' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
      ]),
      photos,
    });
    const [, still, paid] = film.shots;
    expect(paid).toMatchObject({
      engine: 'seedance',
      duration_s: 4,
      move: null,
      ai_generated: true,
    });
    expect(still?.engine).toBe('kenburns');
    expect((still?.duration_s ?? 0) + 4).toBeGreaterThanOrEqual(
      lineSeconds(`${eight} ${eight}`, 2),
    );
    expect(film.warnings.filter((w) => w.startsWith('line'))).toEqual([]);
  });

  it('warns when a line is longer than the fixed clip it sits on — except the last, which runs over the end card', () => {
    const long = `${eight} ${eight}`;
    const mid = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: long, shots: [{ photo: 'dddddddd' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
      ]),
      photos,
    });
    expect(mid.warnings.some((w) => w.startsWith('line 2 needs'))).toBe(true);
    const last = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: long, shots: [{ photo: 'dddddddd' }] },
      ]),
      photos,
    });
    expect(last.warnings.some((w) => w.startsWith('line 4 needs'))).toBe(false);
  });

  it('pans a landscape photo and pushes an upright one, unless the script says otherwise', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'cccccccc' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb', move: 'pull_back' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
      ]),
      photos,
    });
    expect(film.shots.map((s) => s.move)).toEqual(['pan_lr', 'pull_back', 'pull_back', 'pan_rl']);
  });

  it('carries a callout on the shot it was written for', () => {
    const film = buildCityFilm({
      profile: profileOf([
        {
          say: eight,
          shots: [
            {
              photo: 'aaaaaaaa',
              callout: { type: 'stat', big: '#1', label: 'in Georgia', source: 'Fortune, 2024' },
            },
          ],
        },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
      ]),
      photos,
    });
    expect(film.shots[0]?.callout).toEqual({
      type: 'stat',
      big: '#1',
      label: 'in Georgia',
      source: 'Fortune, 2024',
    });
    expect(film.shots[1]?.callout).toBeUndefined();
  });
});
