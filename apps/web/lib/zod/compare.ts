/**
 * `/compare?ids=a,b[,c…]` — the community ids the web compare page draws.
 *
 * Same bounds as the phone (`COMMUNITY_COMPARE_MIN` / `_MAX` in
 * `@percho/shared/community-compare`). Duplicates collapse; anything that is
 * not a uuid fails the whole parse rather than being dropped silently.
 */

import { COMMUNITY_COMPARE_MAX, COMMUNITY_COMPARE_MIN } from '@percho/shared/community-compare';
import { z } from 'zod';

export const compareIdsSchema = z
  .string()
  .transform((raw) => [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().uuid()).min(COMMUNITY_COMPARE_MIN).max(COMMUNITY_COMPARE_MAX));
