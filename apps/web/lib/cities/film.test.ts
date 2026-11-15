/**
 * The two complaints that made this file (owner 2026-11-15, on Suwanee's first
 * city film): City Hall four times, and a deer close-up standing in for the
 * greenway.
 */

import type { CityProfile } from '@/lib/zod/city-profile';
import { describe, expect, it } from 'vitest';
import {
  type FilmPhoto,
  type FilmPoi,
  type PlaceShot,
  buildCityCut,
  coreName,
  isPlaceView,
  secondsFor,
  subjectOf,
} from './film';

const pois: FilmPoi[] = [
  { id: 'hall', name: 'Suwanee City Hall', bucket: 'civic' },
  { id: 'tcp', name: 'Town Center Park', bucket: 'outdoor' },
  { id: 'green', name: 'Suwanee Creek Greenway', bucket: 'outdoor' },
  { id: 'lib', name: 'Gwinnett County Public Library - Suwanee Branch', bucket: 'civic' },
  { id: 'school', name: 'North Gwinnett High School', bucket: 'schools' },
];

const photo = (
  id: string,
  poiId: string,
  description: string,
  category = 'exterior',
  tags: string[] = [],
): FilmPhoto => ({
  id,
  poiId,
  description,
  category,
  tags,
  path: `poi/${poiId}/${id}.jpg`,
});

const photos: FilmPhoto[] = [
  photo(
    'aerial',
    'hall',
    'Aerial view of Suwanee City Hall and the adjacent town center park.',
    'aerial',
  ),
  photo('hall-day', 'hall', 'Exterior facade of Suwanee City Hall on a clear, sunny day.'),
  photo('hall-night', 'hall', 'Exterior facade of Suwanee City Hall at night.'),
  photo('tcp-hall', 'tcp', 'Exterior facade of a modern City Hall building with a clock tower.'),
  photo(
    'wall',
    'tcp',
    'A historic segment of the Berlin Wall displayed in a green public park.',
    'other',
  ),
  photo(
    'deer',
    'green',
    'Close-up of a white-tailed deer along the Suwanee Creek Greenway.',
    'landscape',
    ['wildlife'],
  ),
  photo(
    'trail',
    'green',
    'A paved trail leading into a wooded area of the Suwanee Creek Greenway.',
    'landscape',
  ),
  photo('lib-out', 'lib', 'Exterior facade of the Gwinnett County Public Library Suwanee Branch.'),
  photo(
    'lib-in',
    'lib',
    'Wide-angle interior view of the library with vaulted ceilings.',
    'interior',
  ),
  photo(
    'band',
    'school',
    'Interior of a large high school auditorium with an orchestra on stage.',
    'interior',
  ),
];

const shot = (photo_id: string, poi_id: string, engine = 'kenburns'): PlaceShot => ({
  photo_id,
  poi_id,
  poi_name: pois.find((p) => p.id === poi_id)?.name ?? '',
  engine,
  duration_s: 3,
  vo_line: '',
});

const profile = {
  film: {
    frames: [
      {
        type: 'title',
        eyebrow: 'CITY',
        headline: 'Suwanee',
        say: 'This is Suwanee, Georgia, the top city in the state for families.',
      },
      {
        type: 'rows',
        eyebrow: 'HISTORY',
        headline: 'Since 1871',
        rows: [
          { k: '1871', v: 'Depot' },
          { k: '1949', v: 'City' },
        ],
        say: 'It grew up around a railroad depot and became a city in 1949.',
      },
      {
        type: 'stats',
        eyebrow: 'SCHOOLS',
        headline: 'Schools',
        stats: [{ value: '#16', label: 'in Georgia' }],
        bgBucket: 'schools',
        say: 'Most families come for the schools, ranked sixteenth in Georgia.',
      },
    ],
    places: [
      { poi: 'Town Center Park', say: 'A section of the Berlin Wall stands in Town Center Park.' },
      { poi: 'Suwanee Creek Greenway', say: 'Four miles of greenway run through the woods.' },
      { poi: 'Library', say: 'The library anchors the newest park.' },
    ],
  },
} as unknown as CityProfile;

const cut = () =>
  buildCityCut({
    cityName: 'Suwanee',
    profile,
    shots: [
      shot('aerial', 'hall'),
      shot('hall-day', 'hall'),
      shot('hall-night', 'hall'),
      shot('tcp-hall', 'tcp'),
      shot('wall', 'tcp'),
      shot('deer', 'green'),
      shot('trail', 'green', 'seedance'),
      shot('lib-out', 'lib'),
      shot('lib-in', 'lib'),
      shot('band', 'school'),
    ],
    photos,
    pois,
    seedanceReady: new Set(),
  });

describe('coreName', () => {
  it('drops the city and a branch suffix', () => {
    expect(coreName('Suwanee City Hall', 'Suwanee')).toBe('city hall');
    expect(coreName('Gwinnett County Public Library - Suwanee Branch', 'Suwanee')).toBe(
      'gwinnett county public library',
    );
    expect(coreName('Tequila Mama - Suwanee', 'Suwanee')).toBe('tequila mama');
  });
});

describe('subjectOf', () => {
  it('reads a City Hall photo filed under the park as City Hall', () => {
    expect(subjectOf(photos[3] as FilmPhoto, pois, 'Suwanee')).toBe('hall');
  });

  it('keeps a photo with its own place when the description names no other', () => {
    expect(subjectOf(photos[4] as FilmPhoto, pois, 'Suwanee')).toBe('tcp');
  });

  it('keeps a photo that names its own place even if it mentions another', () => {
    // The aerial names City Hall (its own) and "town center park".
    expect(subjectOf(photos[0] as FilmPhoto, pois, 'Suwanee')).toBe('hall');
  });
});

describe('isPlaceView', () => {
  it('refuses a close-up, food and wildlife', () => {
    expect(isPlaceView(photos[5] as FilmPhoto)).toBe(false);
    expect(
      isPlaceView({ description: 'Two cocktails on a table', category: 'food', tags: [] }),
    ).toBe(false);
    expect(
      isPlaceView({ description: 'A close-up of a pint glass', category: 'interior', tags: [] }),
    ).toBe(false);
  });

  it('accepts a view of the place', () => {
    expect(isPlaceView(photos[6] as FilmPhoto)).toBe(true);
  });
});

describe('buildCityCut', () => {
  it('shows City Hall once — as the title frame — and never the deer', () => {
    const { shots, dropped } = cut();
    const used = shots.map((s) => ('kind' in s ? s.bg_photo_id : s.photo_id));
    expect(
      used.filter((id) => ['aerial', 'hall-day', 'hall-night', 'tcp-hall'].includes(id as string)),
    ).toEqual(['aerial']);
    expect(used).not.toContain('deer');
    expect(dropped.find((d) => d.photo_id === 'deer')?.reason).toMatch(/detail/);
    expect(dropped.find((d) => d.photo_id === 'tcp-hall')?.reason).toMatch(/title frame/);
  });

  it('gives each place exactly one shot, in the planner order', () => {
    const places = cut().shots.filter((s): s is PlaceShot => !('kind' in s));
    expect(places.map((s) => s.photo_id)).toEqual(['wall', 'trail', 'lib-out', 'band']);
  });

  it('never uses a photo twice, and backs the schools frame with a school photo when one is spare', () => {
    const { shots } = cut();
    const used = shots.map((s) => ('kind' in s ? s.bg_photo_id : s.photo_id));
    // The only school photo is in Act 2, so the schools frame reuses it rather
    // than going without — but nothing else repeats.
    const repeats = used.filter((id, i) => used.indexOf(id) !== i);
    expect(repeats.every((id) => id === 'band')).toBe(true);
  });

  it('times a clip by its line and moves an unpaid Seedance shot to Ken Burns', () => {
    const { shots, segments } = cut();
    const trail = shots.find((s) => !('kind' in s) && s.photo_id === 'trail') as PlaceShot;
    expect(trail.engine).toBe('kenburns');
    expect(trail.duration_s).toBe(secondsFor(8, 'place'));
    // One line per clip, each anchored to its own clip.
    expect(segments.map((s) => s.startClip)).toEqual(segments.map((s) => s.endClip));
    expect(segments[0]?.text).toMatch(/^This is Suwanee/);
  });

  it('falls back to no line, with a warning, for a place the profile does not cover', () => {
    const { warnings } = cut();
    expect(warnings.some((w) => /North Gwinnett High School/.test(w))).toBe(true);
  });
});
