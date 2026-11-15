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
 * `film` is the city film's script. Act 1 is `frames` — data frames the render
 * worker draws (`scripts/render-worker/data_frames.py`) over the city's own
 * photos; Act 2 is one shot per place, and `places` holds the line spoken over
 * each. The two acts are meant to run about half and half, and a clip lasts as
 * long as its line takes to say (`lib/cities/film.ts`), so the balance is set
 * by the words written here.
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

/** A spoken line. ~2.5 words a second, so 26 words is a ten-second frame. */
const say = z
  .string()
  .min(1)
  .refine((s) => s.trim().split(/\s+/).length <= 26, { message: 'a line is at most 26 words' });

const frameBase = {
  /** Small caps above the headline: "HISTORY". */
  eyebrow: z.string().min(1).max(36),
  headline: z.string().min(1).max(28),
  sub: z.string().max(64).optional(),
  /** Printed small at the foot of the frame. */
  source: z.string().max(72).optional(),
  say,
  /** Prefer a background photo from a place in this bucket ("schools"). */
  bgBucket: z.string().max(24).optional(),
};

export const cityFilmFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('title'),
    ...frameBase,
    /** The pill under the name: "#1 in Georgia for families · Fortune 2024". */
    chip: z.string().max(56).optional(),
  }),
  z.object({
    type: z.literal('rows'),
    ...frameBase,
    rows: z
      // `v` wraps to two lines beside the key; the worker ellipsises past that.
      .array(z.object({ k: z.string().min(1).max(14), v: z.string().min(1).max(64) }))
      .min(2)
      .max(4),
  }),
  z.object({
    type: z.literal('bars'),
    ...frameBase,
    bars: z
      .array(
        z.object({ label: z.string().min(1).max(8), value: z.number().nonnegative(), display }),
      )
      .min(2)
      .max(6),
  }),
  z.object({
    type: z.literal('stats'),
    ...frameBase,
    stats: z
      .array(z.object({ value: display, label: z.string().min(1).max(56) }))
      .min(1)
      .max(3),
  }),
]);
export type CityFilmFrame = z.infer<typeof cityFilmFrameSchema>;

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
    frames: z.array(cityFilmFrameSchema).min(3).max(7),
    /** The line over each place's shot, matched to a POI by name. */
    places: z.array(z.object({ poi: z.string().min(1).max(80), say })),
  }),
});
export type CityProfile = z.infer<typeof cityProfileSchema>;

/** A stored profile, or null when the column is empty or no longer fits. */
export function parseCityProfile(raw: unknown): CityProfile | null {
  const parsed = cityProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
