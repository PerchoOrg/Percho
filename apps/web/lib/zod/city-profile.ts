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
 *   title — the city's name, large, and where it is. The opening shot.
 *   stat  — one figure, what it measures, and who says so.
 *   count — a figure that changed: it counts up beside a small line chart.
 *   tag   — a place or a date in the corner; no figure.
 */
export const cityFilmCalloutSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('title'),
    big: z.string().min(1).max(24),
    label: z.string().min(1).max(64),
  }),
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
  z.object({
    type: z.literal('tag'),
    kicker: z.string().min(1).max(28),
    text: z.string().max(48).optional(),
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
  /** This shot's share of the line's time, relative to the line's other shots. */
  weight: z.number().positive().max(20).optional(),
  /** The camera move; left out, the cut picks one from the photo's shape. */
  move: z.enum(CITY_FILM_MOVES).optional(),
  callout: cityFilmCalloutSchema.optional(),
});

const filmLine = z.object({
  say,
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
  history: z.array(z.object({ year: z.string().min(1).max(14), text: z.string().min(1).max(140) })),
  growth: z.object({
    series: z.array(z.object({ label: z.string().min(1).max(8), value: z.number().positive() })),
    takeaway: z.string().max(40),
    source,
  }),
  education: z.object({
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
    z.object({ label: z.string().min(1).max(48), value: z.string().min(1).max(40) }),
  ),
  planning: z.array(
    z.object({ title: z.string().min(1).max(60), text: z.string().min(1).max(200) }),
  ),
  sources: z.array(source),

  film: z.object({
    lines: z.array(filmLine).min(4).max(24),
  }),
});
export type CityProfile = z.infer<typeof cityProfileSchema>;

/** A stored profile, or null when the column is empty or no longer fits. */
export function parseCityProfile(raw: unknown): CityProfile | null {
  const parsed = cityProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
