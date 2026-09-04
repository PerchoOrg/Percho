/**
 * Zod schema for GET /api/mobile/search?q=…
 *
 * The query is folded to the same alphabet the public web search uses
 * (lower-case, letters / digits / space / hyphen) before it reaches an
 * `ilike`, so `%` and `_` can never act as wildcards and a stray quote
 * cannot break the PostgREST `.or()` filter string.
 */
import { z } from 'zod';

export const SEARCH_QUERY_MAX_LEN = 40;

export const mobileSearchQuerySchema = z
  .string()
  .max(200)
  .transform((s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SEARCH_QUERY_MAX_LEN)
      .trim(),
  )
  .pipe(z.string().min(2, 'query too short'));

export type MobileSearchQuery = z.infer<typeof mobileSearchQuerySchema>;
