/**
 * Zod schema for the v3 mobile feed pool endpoint (`/api/mobile/feed`).
 *
 * Per CLAUDE.md §3.4 all route input is validated. This endpoint is
 * unauthenticated and buyer-facing (05 §5.1: no signup wall), so the query
 * string is the entire attack surface — `stage` in particular selects which
 * listing gate applies, and a coerced-garbage stage must never fall through to
 * the unlocked branch.
 */

import { z } from 'zod';

/**
 * `stage` is the §0.2 funnel stage. Unparseable input falls back to 0, the
 * most restrictive stage — failing closed, so a malformed request can never
 * unlock listings it should not see.
 */
export const feedPoolQuerySchema = z.object({
  stage: z.coerce.number().int().min(0).max(4).catch(0),
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(1).max(40).catch(12),
  /** Dev-only: restrict listings to those with a playable video. */
  videosOnly: z
    .enum(['0', '1'])
    .catch('0')
    .transform((v) => v === '1'),
  /**
   * Stage 3 returns listing previews only inside communities the buyer already
   * liked (§0.2). Those ids live on the device, so the client sends them.
   * Capped at 50 to bound the `in.()` filter.
   */
  likedCommunityIds: z
    .string()
    .optional()
    .catch(undefined)
    .transform((raw) =>
      (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
        .slice(0, 50),
    ),
});

export type FeedPoolQuery = z.infer<typeof feedPoolQuerySchema>;

export function parseFeedPoolQuery(url: URL): FeedPoolQuery {
  return feedPoolQuerySchema.parse({
    stage: url.searchParams.get('stage') ?? 0,
    offset: url.searchParams.get('offset') ?? 0,
    limit: url.searchParams.get('limit') ?? 12,
    videosOnly: url.searchParams.get('videosOnly') ?? '0',
    likedCommunityIds: url.searchParams.get('likedCommunityIds') ?? undefined,
  });
}
