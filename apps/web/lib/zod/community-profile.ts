/**
 * `communities.profile` — what a community's explore page says (phase339).
 *
 * One researched document per community, the way `cities.profile` is one per
 * city. The page it feeds is a single screen of tiles, so the limits here are
 * the tiles' limits: a verdict line that fits half a phone's width, a figure
 * that fits a tile. A string that would wrap is refused when the profile is
 * written, not discovered on a phone.
 *
 * Wire shape: `packages/shared/src/community-profile.ts`.
 *
 * NO INCOME, SAFETY OR CRIME FIELD, on purpose — see that file.
 */

import type { CommunityProfile } from '@percho/shared/community-profile';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const link = z.string().url().startsWith('https://');
/** A figure as it is printed: "$747K", "#3 · #6". */
const display = z.string().min(1).max(16);
/** One verdict line — half the page wide, two lines at most. */
const verdictLine = z.string().min(3).max(30);

const rank = z.object({
  group: z.string().min(1).max(16),
  label: z.string().min(1).max(16),
  note: z.string().max(20).optional(),
  rank: display,
  of: z.string().min(1).max(20),
  percentile: z.number().min(0).max(100),
  percentile2: z.number().min(0).max(100).optional(),
  tile: z.string().min(2).max(6).optional(),
});

export const communityProfileSchema = z.object({
  asOf: day,
  verdict: z.object({
    // Both may be empty: a computed profile leads with a finding only when one
    // is strong enough (`lib/communities/profile-build.ts`), and the page then
    // opens on its tiles.
    good: z.array(verdictLine).max(3),
    watch: z.array(verdictLine).max(3),
  }),
  ranks: z
    .object({
      rows: z.array(rank).min(1).max(10),
      schools: z
        .array(z.object({ name: z.string().min(1).max(28), url: link }))
        .max(6)
        .optional(),
      note: z.string().max(80).optional(),
    })
    .optional(),
  homeValue: z
    .object({
      area: z.string().min(1).max(20),
      display,
      change: z.string().min(1).max(20),
      headline: z.string().min(1).max(48),
      baseline: z.string().min(1).max(20),
      series: z
        .array(
          z.object({
            year: z.number().int().min(1990).max(2100),
            value: z.number().positive(),
            baseline: z.number().positive(),
          }),
        )
        .min(3)
        .max(20),
      holding: z
        .object({
          display,
          basis: z.string().min(1).max(80),
          rows: z
            .array(
              z.object({
                label: z.string().min(1).max(20),
                usd: z.number().positive(),
                note: z.string().max(14).optional(),
              }),
            )
            .min(1)
            .max(6),
        })
        .optional(),
    })
    .optional(),
  dues: z
    .object({
      display,
      period: z.string().min(1).max(12),
      headline: z.string().min(1).max(48),
      tile: z.object({
        included: z.string().min(1).max(22),
        separate: z.string().min(1).max(22),
      }),
      included: z
        .array(z.object({ title: z.string().min(1).max(24), note: z.string().max(40).optional() }))
        .min(1)
        .max(5),
      separate: z
        .array(
          z.object({
            title: z.string().min(1).max(24),
            note: z.string().max(48).optional(),
            url: link.optional(),
          }),
        )
        .max(5),
    })
    .optional(),
  words: z
    .object({
      lead: z.string().min(1).max(16),
      leadNote: z.string().min(1).max(30),
      scope: z.string().min(1).max(40),
      rows: z
        .array(z.object({ word: z.string().min(1).max(18), pct: z.number().min(0).max(100) }))
        .min(1)
        .max(6),
    })
    .optional(),
  events: z
    .array(
      z
        .object({
          date: day,
          until: day.optional(),
          title: z.string().min(1).max(28),
          where: z.string().min(1).max(40),
          url: link.optional(),
        })
        .refine((e) => !e.until || e.until >= e.date, { message: 'until is before date' }),
    )
    .max(8)
    .optional(),
  // Up to 10 since phase366: own site, Nextdoor, Reddit, Maps, Zillow and three
  // schools. The row scrolls sideways, so the count costs no height.
  links: z
    .array(z.object({ label: z.string().min(1).max(18), url: link }))
    .max(10)
    .optional(),
  sources: z.array(z.object({ name: z.string().min(1).max(80), url: link.optional() })).min(1),
});
export type StoredCommunityProfile = z.infer<typeof communityProfileSchema>;

// What the schema accepts must fit what the apps read; this line fails to
// compile when the two drift.
const _fitsTheWire = (p: StoredCommunityProfile): CommunityProfile => p;
void _fitsTheWire;

/**
 * A researched document under `scripts/admin/community-profiles/`: any of the
 * blocks, each replacing the computed one (`mergeProfile`).
 */
export const communityProfileResearchSchema = communityProfileSchema.partial();

/** A stored profile, or null when the column is empty or no longer fits. */
export function parseCommunityProfile(raw: unknown): StoredCommunityProfile | null {
  const parsed = communityProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
