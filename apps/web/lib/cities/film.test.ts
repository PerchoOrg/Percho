import type { CityFilmLine, CityProfile } from '@/lib/zod/city-profile';
import { describe, expect, it } from 'vitest';
import { type FilmPhoto, buildCityFilm, lineSeconds, speechSeconds, spokenWords } from './film';

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

describe('speechSeconds', () => {
  it('adds a breath for every stop inside the line, and none for the one that ends it', () => {
    const flat = 'Most suburbs just spread and Suwanee built itself a downtown.';
    const broken = 'Most suburbs just spread. Suwanee — Georgia: built itself a downtown.';
    expect(speechSeconds(flat)).toBeCloseTo(10 / 2.3, 5);
    expect(speechSeconds(broken) - 10 / 2.3).toBeCloseTo(3 * 0.35, 5);
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

  it('refuses a photo the city rejected, and says why', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
      ]),
      photos: photos.map((p) =>
        p.id.startsWith('bbbbbbbb') ? { ...p, rejected: 'rejected for this city (outdated)' } : p,
      ),
    });
    expect(film.problems).toHaveLength(1);
    expect(film.problems[0]).toContain('bbbbbbbb is rejected for this city (outdated)');
    expect(film.shots).toHaveLength(1);
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

  it('leaves the move to the directing step, unless the script names one', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'cccccccc' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb', move: 'pull_back' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
      ]),
      photos,
    });
    expect(film.shots.map((s) => s.move)).toEqual([null, null, 'pull_back', null]);
  });

  it('plays a photo the script spends Seedance on as a four-second clip', () => {
    const film = buildCityFilm({
      profile: profileOf([
        {
          say: `${eight} ${eight}`,
          shots: [{ photo: 'aaaaaaaa', seedance: true }, { photo: 'bbbbbbbb' }],
        },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
        { say: eight, shots: [{ photo: 'cccccccc' }] },
      ]),
      photos,
    });
    expect(film.shots[0]).toMatchObject({ engine: 'seedance', duration_s: 4, ai_generated: true });
    expect(film.problems).toEqual([]);
  });

  it('refuses a fourth Seedance shot, counting the photos that already have a clip', () => {
    const film = buildCityFilm({
      profile: profileOf([
        {
          say: eight,
          shots: [
            { photo: 'aaaaaaaa', seedance: true },
            { photo: 'bbbbbbbb', seedance: true },
          ],
        },
        { say: eight, shots: [{ photo: 'eeeeeeee', seedance: true }, { photo: 'ffffffff' }] },
        { say: eight, shots: [{ photo: 'dddddddd' }, { photo: 'cccccccc' }] },
        { say: eight, shots: [{ photo: 'aaaaaaab' }] },
      ]),
      photos: [...photos, photo('aaaaaaab')],
    });
    expect(film.problems).toEqual([
      '4 shots play as Seedance — a film has at most 3 (photos with a cached clip count)',
    ]);
  });

  it("files each shot under its line's chapter, which the city page groups by", () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, chapter: 'history', shots: [{ photo: 'aaaaaaaa' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, chapter: 'schools', shots: [{ photo: 'eeeeeeee' }, { photo: 'ffffffff' }] },
        { say: eight, shots: [{ photo: 'cccccccc' }] },
      ]),
      photos,
    });
    expect(film.shots.map((s) => s.bucket)).toEqual([
      'history',
      'outdoor',
      'schools',
      'schools',
      'outdoor',
    ]);
  });

  it("gives the signature chapter's shots the city's own name for it", () => {
    const profile = profileOf([
      { say: eight, chapter: 'overview', shots: [{ photo: 'aaaaaaaa' }] },
      { say: eight, chapter: 'signature', shots: [{ photo: 'bbbbbbbb' }] },
    ]);
    profile.film.signature = 'Golf';
    const film = buildCityFilm({ profile, photos });
    expect(film.shots.map((s) => s.bucket_label)).toEqual([undefined, 'Golf']);
  });

  it('names a shot for the place it shows, which is what the card labels it', () => {
    const film = buildCityFilm({
      profile: profileOf([
        { say: eight, shots: [{ photo: 'aaaaaaaa', label: 'Old Town' }] },
        { say: eight, shots: [{ photo: 'bbbbbbbb' }] },
        { say: eight, shots: [{ photo: 'eeeeeeee' }] },
        { say: eight, shots: [{ photo: 'ffffffff' }] },
      ]),
      photos,
    });
    expect(film.shots[0]).toMatchObject({ poi_name: 'Old Town', label: 'Old Town' });
    // Not a named place — a map, a street, a skyline: no pill at all, rather
    // than the name of whatever the photo is filed under.
    expect(film.shots[1]).toMatchObject({ poi_name: '', label: '' });
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
