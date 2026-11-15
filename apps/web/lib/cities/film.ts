/**
 * The city film's cut (phase326). PURE: the script in the city's profile and
 * the city's photos in; the shot list and the narration out.
 *
 * The third shape of this file, and the reasons are the owner's:
 *
 *   v1 — a reel of places, the community recipe. "看完我对这个城市没有基本的了解."
 *   v2 — data frames, then one shot per place. "前半部分感觉在罗列数字 不生动
 *        像ppt 后半部分又过度到非常具体的店面."
 *   v3 — one claim, then the proof. Every second is a picture of the city; a
 *        figure is a callout on the shot it belongs to. On its storyboard:
 *        "第一个还不错 有几个没有照片的感觉不好 … 最好是全部都有对应的照片."
 *
 * So the script names its own photographs. A line is spoken over the photos
 * listed under it and no others, and a line whose photo this city does not
 * hold is a PROBLEM, not something to paper over with a related picture — the
 * plan step refuses to plan until there are none. Nothing here chooses a
 * photo: choosing is the editor's job, done when the line is written.
 */

import type { CityFilmCallout, CityProfile } from '@/lib/zod/city-profile';

/** What the cut needs to know about one of the city's photos. */
export interface FilmPhoto {
  id: string;
  poiId: string;
  poiName: string;
  bucket: string;
  width: number | null;
  height: number | null;
  /** A paid Seedance clip is already rendered for this photo. */
  seedanceReady: boolean;
}

/** One clip of the film, in the shape the generate and assemble steps read. */
export interface FilmShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  bucket: string;
  engine: 'kenburns' | 'seedance';
  move: string | null;
  duration_s: number;
  prompt: null;
  ai_generated: boolean;
  label: string;
  chip_label: string;
  label_distance: '';
  sort_order: number;
  /** Drawn over the clip by the render worker at assembly. */
  callout?: CityFilmCallout;
}

export interface NarrationSegment {
  index: number;
  text: string;
  words: number;
  startClip: number;
  endClip: number;
  startS: number;
  endS: number;
  trimmed: false;
}

export interface CityFilm {
  shots: FilmShot[];
  segments: NarrationSegment[];
  /** Why the film cannot be made as written. Empty, or nothing is planned. */
  problems: string[];
  warnings: string[];
  /** Running time before the end card. */
  seconds: number;
}

// ─── timing ─────────────────────────────────────────────────────────────────

/**
 * The narrator's pace, MEASURED on the worker's TTS voice (Gemini, 2026-11-15):
 * 2.0–2.4 words a second.
 */
const WORDS_PER_SECOND = 2.3;
/** `TOUR_XFADE_S` in the worker: every clip gives this much to the crossfade. */
const XFADE_S = 0.5;
/**
 * Silence a line needs besides its clips' crossfades: the worker keeps 0.35s
 * between lines (`NARRATION_MIN_GAP_S`), and the pace above is an average.
 */
const LINE_AIR_S = 0.6;
/** A cached Seedance clip is this long, whatever the plan asks for. */
const SEEDANCE_S = 4;
/** Shorter than this and a clip is two crossfades with nothing between them. */
const MIN_SHOT_S = 2.5;

const half = (s: number) => Math.round(s * 2) / 2;
const halfUp = (s: number) => Math.ceil(s * 2 - 1e-9) / 2;
const tokens = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t));

/**
 * Words as they are SPOKEN: a figure is one token on the page and two or three
 * words aloud ("1990", "85").
 */
export function spokenWords(text: string): number {
  return tokens(text).reduce((a, t) => a + (/\d/.test(t) ? 2.5 : 1), 0);
}

/**
 * A full stop, a colon or a dash INSIDE a line is a breath: the voice stops for
 * about this long. The first v3 cut timed lines by words alone and the four it
 * had to speed up were the four with a sentence break in them — "Most suburbs
 * just spread. Suwanee, Georgia, built itself a downtown." took 4.9s, not 4.3.
 */
const BREATH_S = 0.35;

/** How long a line takes to say. */
export function speechSeconds(text: string): number {
  const breaths = (
    text
      .trim()
      .replace(/[.!?]+$/, '')
      .match(/[.!?:;—]\s/g) ?? []
  ).length;
  return spokenWords(text) / WORDS_PER_SECOND + breaths * BREATH_S;
}

/**
 * How many seconds of clip a line needs across `shots` clips.
 *
 * A line owns the screen from its first clip's start to the next line's first
 * clip, and each clip overlaps its neighbour by the crossfade — so n clips of
 * total length T give the line T − n × 0.5s to be spoken in.
 */
export function lineSeconds(text: string, shots: number): number {
  return speechSeconds(text) + LINE_AIR_S + XFADE_S * shots;
}

// ─── moves ──────────────────────────────────────────────────────────────────

/** The film canvas, `CANVAS_W / CANVAS_H` in the worker. */
const CANVAS_ASPECT = 1080 / 1576;

/**
 * A camera move for a photo the script gave none.
 *
 * A landscape photo is wider than the canvas, so a pan shows what a centred
 * crop would cut off; an upright one already fills the frame and gets a push.
 * `nth` alternates the direction so two neighbours never move alike.
 */
function defaultMove(photo: FilmPhoto, nth: number): string {
  const aspect = photo.width && photo.height ? photo.width / photo.height : 1.33;
  if (aspect > CANVAS_ASPECT * 1.25) return nth % 2 === 0 ? 'pan_lr' : 'pan_rl';
  return nth % 2 === 0 ? 'push_in_slow' : 'pull_back';
}

// ─── the cut ────────────────────────────────────────────────────────────────

export function buildCityFilm(input: {
  profile: CityProfile;
  /** Every photo this city may use — linked to it and not rejected. */
  photos: readonly FilmPhoto[];
}): CityFilm {
  const problems: string[] = [];
  const warnings: string[] = [];
  const shots: FilmShot[] = [];
  const segments: NarrationSegment[] = [];
  const usedAt = new Map<string, number>();
  const lines = input.profile.film.lines;
  let at = 0;

  const find = (ref: string): FilmPhoto | string => {
    const hits = input.photos.filter((p) => p.id === ref || p.id.startsWith(ref));
    if (hits.length === 1) return hits[0] as FilmPhoto;
    return hits.length === 0
      ? `no photo ${ref} among this city's photos`
      : `${ref} matches ${hits.length} photos — use the full id`;
  };

  lines.forEach((line, li) => {
    const n = li + 1;
    const resolved: Array<{
      photo: FilmPhoto;
      weight: number;
      move?: string;
      label?: string;
      callout?: CityFilmCallout;
    }> = [];
    for (const s of line.shots) {
      const photo = find(s.photo);
      if (typeof photo === 'string') {
        problems.push(`line ${n} ("${line.say.slice(0, 40)}…"): ${photo}`);
        continue;
      }
      const before = usedAt.get(photo.id);
      if (before != null) {
        problems.push(
          `line ${n}: photo ${s.photo} is already under line ${before} — a picture is shown once`,
        );
        continue;
      }
      usedAt.set(photo.id, n);
      resolved.push({
        photo,
        weight: s.weight ?? 1,
        move: s.move,
        label: s.label,
        callout: s.callout,
      });
    }
    // A line that lost a photo is already a problem; do not time what is left.
    if (resolved.length !== line.shots.length) return;

    // Seedance clips are four seconds, fixed; the line's other clips share
    // what remains by weight.
    const need = lineSeconds(line.say, resolved.length);
    const fixed = resolved.filter((r) => r.photo.seedanceReady);
    const free = resolved.filter((r) => !r.photo.seedanceReady);
    let remaining = need - fixed.length * SEEDANCE_S;
    let weightLeft = free.reduce((a, r) => a + r.weight, 0);
    // The last line may run on over the end card; any other would run into the
    // next line's clip.
    if (free.length === 0 && remaining > 0.25 && li < lines.length - 1) {
      warnings.push(
        `line ${n} needs ${need.toFixed(1)}s and its clips are ${fixed.length * SEEDANCE_S}s — it will be sped up or run late; give it another photo`,
      );
    }

    const first = shots.length;
    const lineStart = at;
    for (const r of resolved) {
      let seconds = SEEDANCE_S;
      if (!r.photo.seedanceReady) {
        // The last free clip takes what is left, rounded UP, so half-second
        // rounding never leaves the line short.
        const last = weightLeft === r.weight;
        const share = last ? remaining : (remaining * r.weight) / weightLeft;
        seconds = Math.max(MIN_SHOT_S, last ? halfUp(share) : half(share));
        remaining -= seconds;
        weightLeft -= r.weight;
      }
      const sort = shots.length;
      // What the card's place pill reads, and what its progress dashes are
      // grouped by (`lib/feed/tour-segments.ts` reads `poi_name`). Empty when
      // the shot is not of a named place: the card then shows no pill.
      const place = r.label ?? '';
      shots.push({
        photo_id: r.photo.id,
        poi_id: r.photo.poiId,
        poi_name: place,
        // The city page's chip strip groups by this: the line's chapter.
        bucket: line.chapter ?? r.photo.bucket,
        engine: r.photo.seedanceReady ? 'seedance' : 'kenburns',
        move: r.photo.seedanceReady ? null : (r.move ?? defaultMove(r.photo, sort)),
        duration_s: seconds,
        prompt: null,
        ai_generated: r.photo.seedanceReady,
        label: place,
        chip_label: place,
        label_distance: '',
        sort_order: sort,
        ...(r.callout ? { callout: r.callout } : {}),
      });
      at += seconds;
    }
    segments.push({
      index: segments.length,
      text: line.say,
      words: tokens(line.say).length,
      startClip: first,
      endClip: shots.length - 1,
      startS: lineStart,
      endS: at,
      trimmed: false,
    });
  });

  const seconds = at - XFADE_S * Math.max(0, shots.length - 1);
  if (problems.length === 0 && (seconds < 60 || seconds > 120)) {
    warnings.push(`the film runs ${Math.round(seconds)}s — the owner asked for one to two minutes`);
  }
  return { shots, segments, problems, warnings, seconds };
}
