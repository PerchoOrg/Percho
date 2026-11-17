import {
  GOLDEN_ANNOTATIONS,
  GOLDEN_PHOTOS,
} from '@/lib/poi/tour-orchestrator/fixtures/peachtree-corners';
import type { PhotoAnnotation } from '@/lib/poi/tour-orchestrator/types';
import { describe, expect, it } from 'vitest';
import type { FilmShot } from './film';
import { directCityFilm } from './motion';

const annotations = new Map(GOLDEN_ANNOTATIONS.map((a) => [a.photo_id, a]));
const metas = new Map(GOLDEN_PHOTOS.map((p) => [p.photo_id, p]));

/** A shot as `buildCityFilm` leaves it: timed, not yet directed. */
const shot = (photoId: string, over: Partial<FilmShot> = {}): FilmShot => ({
  photo_id: photoId,
  poi_id: 'poi',
  poi_name: '',
  bucket: 'overview',
  engine: 'kenburns',
  move: null,
  duration_s: 4,
  prompt: null,
  ai_generated: false,
  label: '',
  chip_label: '',
  label_distance: '',
  sort_order: 0,
  ...over,
});
const film = (over: Record<string, Partial<FilmShot>> = {}) =>
  GOLDEN_PHOTOS.map((p, i) => shot(p.photo_id, { sort_order: i, ...over[p.photo_id] }));

/** A photo Seedance can animate, and one it cannot. */
const eligible = (a: PhotoAnnotation) =>
  a.has_natural_motion &&
  a.people_prominence !== 'foreground' &&
  !a.has_readable_brand_signage &&
  !['interior_close', 'building_facade', 'street_perspective', 'signage'].includes(
    a.dominant_subject,
  );
const animatable = GOLDEN_ANNOTATIONS.find(eligible)?.photo_id ?? '';
const still = GOLDEN_ANNOTATIONS.find((a) => !a.has_natural_motion)?.photo_id ?? '';

describe('directCityFilm', () => {
  it('directs every shot, and not as a film of pans', () => {
    const { shots, problems } = directCityFilm({
      shots: film(),
      annotations,
      metas,
      seedanceReady: new Set(),
    });
    expect(problems).toEqual([]);
    expect(shots.every((s) => s.move)).toBe(true);
    expect(shots.some((s) => s.engine === 'depthflow')).toBe(true);
    expect(shots.some((s) => s.engine === 'seedance')).toBe(false);
    const pans = shots.filter((s) => s.move === 'pan_lr' || s.move === 'pan_rl').length;
    expect(pans).toBeLessThan(shots.length / 2);
    // Timing is the script's: directing never changes a duration.
    expect(shots.every((s) => s.duration_s === 4)).toBe(true);
  });

  it('writes the prompt for a Seedance shot the script asks for', () => {
    const { shots, problems } = directCityFilm({
      shots: film({ [animatable]: { engine: 'seedance', ai_generated: true } }),
      annotations,
      metas,
      seedanceReady: new Set(),
    });
    expect(problems).toEqual([]);
    const paid = shots.find((s) => s.photo_id === animatable);
    expect(paid?.engine).toBe('seedance');
    expect(paid?.prompt).toContain('Storefront signage stays unchanged.');
  });

  it('refuses a Seedance shot of a photo in which nothing moves — before anything is paid for', () => {
    const { problems } = directCityFilm({
      shots: film({ [still]: { engine: 'seedance', ai_generated: true } }),
      annotations,
      metas,
      seedanceReady: new Set(),
    });
    expect(problems).toEqual([
      `photo ${still.slice(0, 8)} cannot be a Seedance shot — nothing in it moves`,
    ]);
  });

  it('never re-judges a clip that is already rendered', () => {
    const { problems } = directCityFilm({
      shots: film({ [still]: { engine: 'seedance', ai_generated: true } }),
      annotations,
      metas,
      seedanceReady: new Set([still]),
    });
    expect(problems).toEqual([]);
  });

  it('keeps a move the script named, and gives a plain one to a photo nobody annotated', () => {
    const named = GOLDEN_PHOTOS[1]?.photo_id ?? '';
    const blind = GOLDEN_PHOTOS[2]?.photo_id ?? '';
    const without = new Map(annotations);
    without.delete(blind);
    const { shots, warnings } = directCityFilm({
      shots: film({ [named]: { move: 'tilt_td' } }),
      annotations: without,
      metas,
      seedanceReady: new Set(),
    });
    expect(shots.find((s) => s.photo_id === named)).toMatchObject({
      engine: 'kenburns',
      move: 'tilt_td',
    });
    expect(shots.find((s) => s.photo_id === blind)?.move).toMatch(
      /^(pan_lr|pan_rl|push_in_slow|pull_back)$/,
    );
    expect(warnings.some((w) => w.includes(blind.slice(0, 8)))).toBe(true);
  });
});
