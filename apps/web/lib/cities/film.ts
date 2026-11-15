/**
 * The city film's cut (phase322). PURE: the planner's shots, the city's photos
 * and its profile in; two acts out.
 *
 *   Act 1 — the fundamentals. One data frame per `profile.film.frames`, drawn
 *           by the render worker over one of the city's own photos.
 *   Act 2 — the places. ONE shot per place.
 *
 * Why this exists: the first city film reused the community recipe — a reel of
 * places — and the owner's verdict was "看完我对这个城市没有基本的了解", with two
 * specific complaints this file answers in code:
 *
 *   "4个重复的city hall" — City Hall's facade was filed under two POIs (City
 *   Hall, and Town Center Park, whose Google photos are mostly of City Hall),
 *   and each POI got its own clips. So a shot's SUBJECT is what its
 *   description names, not the POI it is filed under (`subjectOf`), and a
 *   subject appears once in the whole film.
 *
 *   "一个狗特写 why????" — a close-up of a deer stood in for the greenway. A
 *   city film shows the place itself (`isPlaceView`): no close-ups, no food,
 *   no wildlife.
 *
 * The acts run about half and half (owner, same day). A clip lasts as long as
 * its line takes to say, so the balance is decided by the script in the
 * profile; `actBalance` reports it and the plan step warns when it drifts.
 */

import type { CityFilmFrame, CityProfile } from '@/lib/zod/city-profile';

/** What the film needs to know about a photo. */
export interface FilmPhoto {
  id: string;
  poiId: string;
  /** The vision tagger's one-line description. */
  description: string;
  /** `ai_tags.primary_category` — "aerial", "food", "landscape", … */
  category: string | null;
  tags: string[];
  /** Storage path of the file to draw (enhanced when approved). */
  path: string;
}

export interface FilmPoi {
  id: string;
  name: string;
  bucket: string;
}

/** A place shot as the planner emits it — only the fields this file touches. */
export interface PlaceShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  bucket?: string;
  engine: string;
  move?: string | null;
  duration_s: number;
  prompt?: string | null;
  ai_generated?: boolean;
  vo_line?: string;
  chip_label?: string;
  label?: string;
  label_distance?: string;
  [key: string]: unknown;
}

/** An Act 1 clip. No `photo_id`: it has no `photo_clips` row to render. */
export interface DataClip {
  kind: 'data';
  frame: Omit<CityFilmFrame, 'say' | 'bgBucket'>;
  bg_photo_id: string;
  bg_path: string;
  duration_s: number;
  /** What the phone's progress bar and place chip read. */
  poi_name: string;
  label: string;
  label_distance: '';
  bucket: 'city';
  engine: 'data';
  sort_order: number;
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

// ─── subjects ───────────────────────────────────────────────────────────────

/**
 * A POI's name without the city and without a branch suffix — the words a
 * photo description would use for it. "Suwanee City Hall" → "city hall".
 */
export function coreName(name: string, cityName: string): string {
  const city = cityName.trim().toLowerCase();
  let s = name.toLowerCase();
  s = s.replace(/\s+[-–—]\s+.*$/, ''); // "… - Suwanee Branch", "… - Suwanee"
  if (city)
    s = s
      .split(/\s+/)
      .filter((w) => w !== city)
      .join(' ');
  return s
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two words or eight letters: "park" alone would match half the city. */
const specific = (core: string) => core.includes(' ') || core.length >= 8;

/**
 * The place a photo actually shows: its own POI when the description names
 * it, another POI of this film when the description names that one instead.
 */
export function subjectOf(photo: FilmPhoto, pois: readonly FilmPoi[], cityName: string): string {
  const text = photo.description.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  const own = pois.find((p) => p.id === photo.poiId);
  if (own) {
    const core = coreName(own.name, cityName);
    if (core && text.includes(core)) return own.id;
  }
  // Longest name first, so "town center park" wins over a bare "park" POI.
  const others = pois
    .filter((p) => p.id !== photo.poiId)
    .map((p) => ({ id: p.id, core: coreName(p.name, cityName) }))
    .filter((p) => specific(p.core))
    .sort((a, b) => b.core.length - a.core.length);
  return others.find((p) => text.includes(p.core))?.id ?? photo.poiId;
}

const NOT_A_PLACE_TAGS = new Set(['wildlife', 'animal', 'animals', 'pet', 'pets']);

/** Whether the photo shows the place itself rather than a detail of it. */
export function isPlaceView(photo: Pick<FilmPhoto, 'description' | 'category' | 'tags'>): boolean {
  if (/\bclose[- ]?up\b/i.test(photo.description)) return false;
  if (photo.category === 'food') return false;
  return !photo.tags.some((t) => NOT_A_PLACE_TAGS.has(t.toLowerCase()));
}

// ─── timing ─────────────────────────────────────────────────────────────────

/**
 * The narrator's pace, MEASURED on the worker's TTS voice (Gemini, 2026-11-15):
 * 2.0–2.4 words a second. The first cut assumed 2.5 and eight of its twelve
 * lines had to be sped up to fit their clips.
 */
const WORDS_PER_SECOND = 2.3;
const half = (s: number) => Math.round(s * 2) / 2;
const tokens = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter((t) => /[A-Za-z0-9]/.test(t));
const countWords = (text: string) => tokens(text).length;

/**
 * Words as they are SPOKEN: a figure is one token on the page and two or three
 * words aloud ("1990", "85"). The slowest measured line was the one with a
 * year and a count in it.
 */
export function spokenWords(text: string): number {
  return tokens(text).reduce((a, t) => a + (/\d/.test(t) ? 2.5 : 1), 0);
}

/** How long a clip runs: its line at speaking pace, plus air. */
export function secondsFor(words: number, kind: 'data' | 'place'): number {
  const [air, min, max] = kind === 'data' ? [1.0, 5, 12] : [0.7, 3.5, 9];
  return half(Math.min(max, Math.max(min, words / WORDS_PER_SECOND + air)));
}

// ─── the cut ────────────────────────────────────────────────────────────────

export interface CityCut {
  shots: Array<DataClip | PlaceShot>;
  segments: NarrationSegment[];
  dropped: Array<{ photo_id: string; poi_id: string; reason: string }>;
  warnings: string[];
  /** Seconds of each act, before crossfades. */
  balance: { fundamentals: number; places: number };
}

/** Where the profile's script speaks of this place, or -1. */
function scriptIndex(shot: PlaceShot, profile: CityProfile, cityName: string): number {
  const core = coreName(shot.poi_name, cityName);
  return profile.film.places.findIndex((p) => {
    const c = coreName(p.poi, cityName);
    return c !== '' && (c === core || core.includes(c) || c.includes(core));
  });
}

/** The line for a place: the profile's, else the curator's caption. */
function lineFor(shot: PlaceShot, profile: CityProfile, cityName: string): string {
  const authored = profile.film.places[scriptIndex(shot, profile, cityName)];
  return (authored?.say ?? shot.vo_line ?? '').trim();
}

export function buildCityCut(input: {
  cityName: string;
  profile: CityProfile;
  /** The planner's shots, in its order. */
  shots: readonly PlaceShot[];
  /** Every usable photo of the places in the cut — shots and spares. */
  photos: readonly FilmPhoto[];
  pois: readonly FilmPoi[];
  /** Photos with a ready Seedance clip; anything else renders on a free engine. */
  seedanceReady: ReadonlySet<string>;
}): CityCut {
  const { cityName, profile, pois } = input;
  const photoById = new Map(input.photos.map((p) => [p.id, p]));
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const dropped: CityCut['dropped'] = [];
  const warnings: string[] = [];
  const subject = (p: FilmPhoto) => subjectOf(p, pois, cityName);

  // The title frame's photo is shown whole, so it uses up its subject: an
  // aerial of the town if there is one, else the planner's opening shot.
  const views = input.photos.filter(isPlaceView);
  const firstShotPhoto = input.shots
    .map((s) => photoById.get(s.photo_id))
    .find((p) => p && isPlaceView(p));
  const title = views.find((p) => p.category === 'aerial') ?? firstShotPhoto ?? views[0];
  const taken = new Set<string>();
  if (title) taken.add(subject(title));

  // ── Act 2: one shot per subject ──
  const places: PlaceShot[] = [];
  for (const shot of input.shots) {
    const photo = photoById.get(shot.photo_id);
    const drop = (reason: string) =>
      dropped.push({ photo_id: shot.photo_id, poi_id: shot.poi_id, reason });
    if (!photo) {
      drop('photo not found');
      continue;
    }
    if (photo.id === title?.id) continue; // it is the title frame, not dropped
    if (!isPlaceView(photo)) {
      drop('a detail, not the place — a city film shows the place itself');
      continue;
    }
    const subj = subject(photo);
    if (taken.has(subj)) {
      const name = poiById.get(subj)?.name ?? 'this place';
      drop(
        subj === (title ? subject(title) : null)
          ? `${name} is the title frame — one view of a place per film`
          : `${name} already has its shot — one view of a place per film`,
      );
      continue;
    }
    taken.add(subj);
    // A photo filed under one POI that shows another is labelled as what it shows.
    const shown = poiById.get(subj);
    places.push(
      shown && subj !== shot.poi_id
        ? {
            ...shot,
            poi_id: shown.id,
            poi_name: shown.name,
            chip_label: shown.name,
            label: shown.name,
            bucket: shown.bucket,
          }
        : { ...shot },
    );
  }

  // The script's order is the cut's order: its lines are written to follow one
  // another ("Next door, the library…"). A place the script does not mention
  // keeps the planner's order, after the ones it does.
  const scripted = (s: PlaceShot) => {
    const i = scriptIndex(s, profile, cityName);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  places.sort((a, b) => scripted(a) - scripted(b));

  for (const shot of places) {
    const line = lineFor(shot, profile, cityName);
    const seconds = secondsFor(spokenWords(line), 'place');
    // A cached Seedance clip is four seconds; a line that needs longer, or a
    // clip that would have to be paid for, renders as Ken Burns instead.
    if (shot.engine === 'seedance' && (!input.seedanceReady.has(shot.photo_id) || seconds > 4.5)) {
      shot.engine = 'kenburns';
      shot.move = 'push_in_slow';
      shot.prompt = null;
      shot.ai_generated = false;
    }
    shot.duration_s = shot.engine === 'seedance' ? 4 : seconds;
    shot.vo_line = line;
  }

  // ── Act 1: a data frame per profile frame, each over a different photo ──
  //
  // Never another view of the title's subject: a second City Hall behind a
  // chart is still a second City Hall. Spare photos first, so the same picture
  // is not seen twice; a photo from Act 2 only when the spares run out.
  const inActTwo = new Set(places.map((s) => s.photo_id));
  const titleSubject = title ? subject(title) : null;
  const usable = views.filter((p) => p.id !== title?.id && subject(p) !== titleSubject);
  const spare = usable.filter((p) => !inActTwo.has(p.id));
  const reuse = usable.filter((p) => inActTwo.has(p.id));
  const usedBg = new Set<string>();
  const usedBgSubjects = new Set<string>();
  const takeBackground = (bucket: string | undefined): FilmPhoto | undefined => {
    const fresh = (p: FilmPhoto) => !usedBg.has(p.id);
    const inBucket = (p: FilmPhoto) => !bucket || poiById.get(p.poiId)?.bucket === bucket;
    const newSubject = (p: FilmPhoto) => !usedBgSubjects.has(subject(p));
    const pick =
      spare.find((p) => fresh(p) && inBucket(p) && newSubject(p)) ??
      spare.find((p) => fresh(p) && newSubject(p)) ??
      spare.find(fresh) ??
      reuse.find((p) => fresh(p) && inBucket(p)) ??
      reuse.find(fresh) ??
      title;
    if (pick) {
      usedBg.add(pick.id);
      usedBgSubjects.add(subject(pick));
    }
    return pick;
  };

  const frames: DataClip[] = [];
  const lines: string[] = [];
  for (const f of profile.film.frames) {
    const bg =
      f.type === 'title' ? (title ?? takeBackground(f.bgBucket)) : takeBackground(f.bgBucket);
    if (!bg) {
      warnings.push(`no photo for the "${f.eyebrow}" frame — it was left out`);
      continue;
    }
    const { say, bgBucket: _bgBucket, ...frame } = f;
    frames.push({
      kind: 'data',
      frame,
      bg_photo_id: bg.id,
      bg_path: bg.path,
      duration_s: secondsFor(spokenWords(say), 'data'),
      poi_name: f.type === 'title' ? cityName : titleCase(f.eyebrow),
      label: f.type === 'title' ? cityName : titleCase(f.eyebrow),
      label_distance: '',
      bucket: 'city',
      engine: 'data',
      sort_order: frames.length,
    });
    lines.push(say);
  }

  const shots: CityCut['shots'] = [
    ...frames,
    ...places.map((s, i) => ({ ...s, sort_order: frames.length + i })),
  ];
  for (const s of places) {
    lines.push(s.vo_line ?? '');
    if (!s.vo_line) warnings.push(`no line for ${s.poi_name} — it plays under music alone`);
  }

  // One narration line per clip, anchored to the clip it describes.
  const segments: NarrationSegment[] = [];
  let at = 0;
  shots.forEach((clip, i) => {
    const text = lines[i] ?? '';
    if (text) {
      segments.push({
        index: segments.length,
        text,
        words: countWords(text),
        startClip: i,
        endClip: i,
        startS: at,
        endS: at + clip.duration_s,
        trimmed: false,
      });
    }
    at += clip.duration_s;
  });

  const balance = {
    fundamentals: frames.reduce((a, c) => a + c.duration_s, 0),
    places: places.reduce((a, c) => a + c.duration_s, 0),
  };
  const share = balance.fundamentals / Math.max(1, balance.fundamentals + balance.places);
  if (share < 0.4 || share > 0.6) {
    warnings.push(
      `the acts are ${Math.round(share * 100)}% fundamentals / ${Math.round((1 - share) * 100)}% places — they should run about half and half`,
    );
  }

  return { shots, segments, dropped, warnings, balance };
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s&])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
