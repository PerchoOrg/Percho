/**
 * Phase 48.5 — server-side input fingerprint for the social-copy cache.
 *
 * Why hash on the server: clients must not control the cache key, or a
 * crafted client could flush/poison the cache. We normalize then sha256.
 *
 * Normalization rules — must stay in sync between writers (POST drafts /
 * SocialCopyPanel save path) and readers (generate-social cache lookup):
 *   - platform: lowercase exact enum string
 *   - language: lowercase exact enum string
 *   - highlights: trimmed, non-empty, lowercased, deduped, sorted (so
 *     "Walk to schools, Renovated kitchen" === "renovated kitchen, walk to schools")
 *
 * The fingerprint is per (platform, language, highlights) only. Listing
 * facts (price, beds, etc.) live on the listing — the cache row is
 * scoped per listing_id at the DB level, so changing the listing's
 * price would not falsely cache-hit a stale row for a *different*
 * listing. Within the same listing we currently treat listing facts as
 * fixed for caching purposes; agents who change price+regen will
 * (correctly) get a stale cache hit until they edit the saved draft or
 * delete it. We surface this in the UI by labeling cached responses.
 */

import { createHash } from 'node:crypto';

export function normalizeHighlights(values: readonly string[] | undefined | null): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (t.length > 0) seen.add(t);
  }
  return [...seen].sort();
}

export function socialDraftHash(input: {
  platform: string;
  language: string;
  highlights?: readonly string[] | null;
}): string {
  const payload = JSON.stringify({
    p: input.platform.toLowerCase(),
    l: input.language.toLowerCase(),
    h: normalizeHighlights(input.highlights),
  });
  return createHash('sha256').update(payload).digest('hex');
}
