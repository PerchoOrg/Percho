/**
 * Directing a city film: engine and camera move for every shot (phase347). PURE.
 *
 * The script decides WHICH photo plays under which line and for how long
 * (`film.ts`). How the camera treats it is decided here, by the same code that
 * directs a community tour — the Scheduler's DepthFlow quota, people ban,
 * subject preferences and no-repeat rule, and the Guard's Seedance prompt.
 * Before this a city shot got `defaultMove`: a landscape photo pans, and
 * Alpharetta's first cut was 27 pans in 29 shots (owner 2026-11-17: "所有照片的
 * 效果都只是左右滑动？？我们一整套的用在home 和community的编排去哪了").
 *
 * Seedance is the script's call (`seedance: true`, at most three a film —
 * `film.ts` counts them). What this adds is the refusal: a photo Seedance
 * cannot animate well is a problem, named, before anything is paid for.
 */
import { guardClips } from '@/lib/poi/tour-orchestrator/guard';
import {
  isPanorama,
  scheduleInOrder,
  seedanceBlocker,
} from '@/lib/poi/tour-orchestrator/scheduler';
import type { PhotoAnnotation, PhotoMeta } from '@/lib/poi/tour-orchestrator/types';
import { type FilmShot, defaultMove } from './film';

export interface DirectedFilm {
  shots: FilmShot[];
  /** Why the film cannot be made as written. Empty, or nothing is planned. */
  problems: string[];
  warnings: string[];
}

export function directCityFilm(input: {
  /** `buildCityFilm`'s shots: order, timing and the script's Seedance picks. */
  shots: readonly FilmShot[];
  /** The Curator's reading of each photo, by photo id. */
  annotations: ReadonlyMap<string, PhotoAnnotation>;
  /** Pixel size and description, by photo id. */
  metas: ReadonlyMap<string, PhotoMeta>;
  /** Photos whose Seedance clip is already rendered: reused, never re-judged. */
  seedanceReady: ReadonlySet<string>;
}): DirectedFilm {
  const problems: string[] = [];
  const warnings: string[] = [];

  // A Seedance shot the script asks for has to be one Seedance can do.
  for (const shot of input.shots) {
    if (shot.engine !== 'seedance' || input.seedanceReady.has(shot.photo_id)) continue;
    const annotation = input.annotations.get(shot.photo_id);
    const meta = input.metas.get(shot.photo_id);
    const ref = shot.photo_id.slice(0, 8);
    if (!annotation || !meta) {
      problems.push(`photo ${ref} cannot be a Seedance shot — it has not been annotated`);
      continue;
    }
    const blocker = seedanceBlocker(annotation, isPanorama(meta.width_px, meta.height_px));
    if (blocker) problems.push(`photo ${ref} cannot be a Seedance shot — ${blocker}`);
  }
  if (problems.length > 0) return { shots: [...input.shots], problems, warnings };

  // The shots the Scheduler can direct, in film order. A shot whose move the
  // script named is not offered: it is Ken Burns, with that move.
  const directable = input.shots.flatMap((shot) => {
    const annotation = input.annotations.get(shot.photo_id);
    const meta = input.metas.get(shot.photo_id);
    if (!annotation || !meta || (shot.engine !== 'seedance' && shot.move)) return [];
    return [{ annotation, meta }];
  });
  const seedanceIds = new Set(
    input.shots.filter((s) => s.engine === 'seedance').map((s) => s.photo_id),
  );
  const scheduled = scheduleInOrder(directable, seedanceIds);
  const guarded = guardClips(
    scheduled.clips,
    directable.map((d) => d.annotation),
    directable.map((d) => d.meta),
  );
  const directed = new Map(guarded.clips.map((c) => [c.photo_id, c]));
  for (const w of scheduled.warnings) warnings.push(`${w.code}: ${w.detail}`);

  const shots = input.shots.map((shot, i): FilmShot => {
    const clip = directed.get(shot.photo_id);
    if (shot.engine === 'seedance') {
      // A cached clip plays whatever is written here; a new one is rendered
      // from this move and prompt.
      return {
        ...shot,
        move: clip?.move ?? null,
        prompt: clip?.engine === 'seedance' ? clip.prompt : null,
      };
    }
    if (shot.move) return shot;
    if (!clip) {
      warnings.push(`photo ${shot.photo_id.slice(0, 8)} has no annotation — it gets a plain move`);
      const meta = input.metas.get(shot.photo_id);
      return {
        ...shot,
        move: defaultMove({ width: meta?.width_px ?? null, height: meta?.height_px ?? null }, i),
      };
    }
    return {
      ...shot,
      engine: clip.engine === 'depthflow' ? 'depthflow' : 'kenburns',
      move: clip.move,
    };
  });
  return { shots, problems, warnings };
}
