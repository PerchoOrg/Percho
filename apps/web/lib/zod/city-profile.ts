/**
 * `cities.profile` — a city's fundamentals, and the film frames drawn from them.
 *
 * A city card is not a community card (owner 2026-11-15): it leads with what
 * the city IS — history, growth, schools, getting around, planning — and only
 * then its places. Every figure names its source, because the point of the
 * numbers is to be believed; a ranking appears only where a named publisher
 * made it.
 *
 * NO SAFETY OR CRIME FIELD, on purpose. Owner, same day: "安全数据先不放" — and
 * `packages/shared/src/lenses.ts` records why adding one needs him (fair
 * housing). Do not add a key for it here without that decision.
 *
 * `film` is the city film's script (phase326): spoken lines, and under each
 * line the photographs it is spoken over — named by `poi_photos` id, chosen by
 * whoever wrote the line. EVERY line has at least one photo of what it says
 * (owner 2026-11-15: "最好是全部都有对应的照片"), which the schema requires and
 * the plan step checks against the city's photos. A figure is a `callout` on
 * the shot it belongs to, never a frame of its own: the first two cuts were
 * rejected as "像ppt". The cut itself is `lib/cities/film.ts`; the callouts
 * are drawn by `scripts/render-worker/callouts.py`.
 */

import { z } from 'zod';

const source = z.object({
  name: z.string().min(1).max(80),
  year: z.string().max(12).optional(),
  url: z.string().url().optional(),
});

/** A short display string — a figure as it is printed ("$103,260", "~40 min"). */
const display = z.string().min(1).max(24);

const ranking = z.object({
  /** "#1" */
  rank: z.string().min(2).max(5),
  /** "in Georgia" */
  scope: z.string().min(1).max(20),
  title: z.string().min(1).max(60),
  detail: z.string().max(160),
  source,
});

const stat = z.object({
  label: z.string().min(1).max(40),
  value: display,
  note: z.string().max(60).optional(),
});

const comparison = z.object({
  label: z.string().min(1).max(48),
  city: z.object({ value: z.number().positive(), display }),
  state: z.object({ value: z.number().positive(), display }),
  /** "1.3× the state" */
  takeaway: z.string().max(24),
});

// ─── film ───────────────────────────────────────────────────────────────────

/** A spoken line. ~2.3 words a second, so 26 words is an eleven-second line. */
const say = z
  .string()
  .min(1)
  .refine((s) => s.trim().split(/\s+/).length <= 26, { message: 'a line is at most 26 words' });

/**
 * One fact, drawn over the picture it belongs to.
 *
 *   stat  — one figure, what it measures, and who says so.
 *   count — a figure that changed: it counts up beside a small line chart.
 *
 * A place NAME is not a callout: the phone draws it, as it does on every
 * community film, from the shot's `label` (phase329).
 */
export const cityFilmCalloutSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stat'),
    big: z.string().min(1).max(12),
    label: z.string().min(1).max(64),
    source: z.string().max(48).optional(),
  }),
  z.object({
    type: z.literal('count'),
    from: z.number().nonnegative(),
    to: z.number().nonnegative(),
    label: z.string().min(1).max(64),
    source: z.string().max(48).optional(),
    /** The line beside the counter: its last value is where the counter ends. */
    series: z
      .array(z.object({ label: z.string().min(1).max(6), value: z.number().nonnegative() }))
      .min(2)
      .max(6),
  }),
]);
export type CityFilmCallout = z.infer<typeof cityFilmCalloutSchema>;

/** Ken Burns moves the render worker implements (`LISTING_CLIP_MODES`). */
export const CITY_FILM_MOVES = [
  'push_in',
  'push_in_slow',
  'pull_back',
  'pan_lr',
  'pan_rl',
  'push_pan_lr',
  'push_pan_rl',
  'tilt_td',
] as const;

const filmShot = z.object({
  /** A `poi_photos.id`, or its first eight characters. */
  photo: z
    .string()
    .regex(/^[0-9a-f]{8}(-[0-9a-f-]{27})?$/, 'a photo id, or its first 8 characters'),
  /**
   * The place the picture shows, as the card's place pill names it
   * ("Old Town", "Riverwatch Middle"). Only a real place gets one: left out,
   * the pill is hidden for the shot (owner 2026-11-15, on "Suwanee, 1897"
   * in the corner: "不是地名 不要显示在左上角 不需要所有页面都显示").
   */
  label: z.string().min(1).max(40).optional(),
  /** This shot's share of the line's time, relative to the line's other shots. */
  weight: z.number().positive().max(20).optional(),
  /** The camera move; left out, the cut picks one from the photo's shape. */
  move: z.enum(CITY_FILM_MOVES).optional(),
  callout: cityFilmCalloutSchema.optional(),
});

/**
 * The film's chapters, as the city page's chip strip names them — the
 * community page's category strip, for a film that is told in parts rather
 * than visited place by place. Keys and labels: `@percho/shared/tour-buckets`.
 */
export const CITY_FILM_CHAPTERS = [
  'overview',
  'schools',
  'homes',
  'commute',
  'daily',
  'outdoor',
  'downtown',
  'events',
  'signature',
  'growth',
  'history',
  'future',
] as const;
export type CityFilmChapter = (typeof CITY_FILM_CHAPTERS)[number];

const filmLine = z.object({
  say,
  chapter: z.enum(CITY_FILM_CHAPTERS).optional(),
  /** The pictures the line is spoken over, in order. Never empty. */
  shots: z.array(filmShot).min(1).max(4),
});
export type CityFilmLine = z.infer<typeof filmLine>;

export const cityProfileSchema = z.object({
  /** One line for the card face. */
  tagline: z.string().min(1).max(140),
  /** The city page's opening paragraph. */
  summary: z.string().min(1).max(600),
  /** "33 mi northeast of downtown Atlanta" */
  locationNote: z.string().min(1).max(64),

  rankings: z.array(ranking).max(6),
  /** At a glance — what the state comparison does not already say. */
  stats: z.array(stat).max(6),
  compare: z.object({
    against: z.string().min(1).max(24),
    rows: z.array(comparison).max(4),
    source,
  }),
  history: z.array(
    z.object({
      year: z.string().min(1).max(14),
      /** A few words for the page's timeline ("Railroad depot"); `text` shows on tap. */
      short: z.string().min(1).max(24).optional(),
      text: z.string().min(1).max(140),
    }),
  ),
  growth: z.object({
    series: z.array(z.object({ label: z.string().min(1).max(8), value: z.number().positive() })),
    takeaway: z.string().max(40),
    source,
  }),
  education: z.object({
    /**
     * The schools worth naming, at every level (owner 2026-11-15: "need to
     * mention top primary, middle and high, even university if any in this
     * area, not just high school"). A `rank` only where a named publisher made
     * one; a college is listed for what it is.
     */
    schools: z
      .array(
        z.object({
          level: z.enum(['elementary', 'middle', 'high', 'college']),
          name: z.string().min(1).max(60),
          /** "#9" */
          rank: z.string().min(2).max(5).optional(),
          /** "in Georgia" */
          scope: z.string().max(20).optional(),
          detail: z.string().max(160),
          source,
        }),
      )
      .max(12),
    measure: z.string().min(1).max(40),
    rows: z.array(
      z.object({
        label: z.string().min(1).max(32),
        pct: z.number().min(0).max(100),
        display,
        /** The baseline row (district, state) is drawn in the muted colour. */
        baseline: z.boolean().optional(),
      }),
    ),
    note: z.string().max(360),
  }),
  gettingAround: z.array(
    z.object({
      label: z.string().min(1).max(48),
      value: z.string().min(1).max(40),
      /** Drive time as a range — off-peak to rush — for the page's chart. */
      minutes: z
        .object({ min: z.number().positive().max(240), max: z.number().positive().max(240) })
        .refine((m) => m.max >= m.min, { message: 'max is below min' })
        .optional(),
    }),
  ),
  planning: z.array(
    z.object({ title: z.string().min(1).max(60), text: z.string().min(1).max(200) }),
  ),
  sources: z.array(source),

  film: z.object({
    lines: z.array(filmLine).min(4).max(24),
    /**
     * What the `signature` chapter is called on the chips — the one thing only
     * this city has ("Golf", "Public art"). Required by `chapterProblems` when
     * a line uses that chapter.
     */
    signature: z.string().min(2).max(14).optional(),
  }),
});
export type CityProfile = z.infer<typeof cityProfileSchema>;

/** A stored profile, or null when the column is empty or no longer fits. */
export function parseCityProfile(raw: unknown): CityProfile | null {
  const parsed = cityProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
