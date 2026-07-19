/**
 * Slug helpers — turn a human-entered name (community name, listing address)
 * into a URL-safe identifier.
 *
 * Pipeline: lowercase → NFKD → strip diacritics/punctuation → collapse
 * whitespace/underscores to hyphens → trim leading/trailing hyphens → cap
 * to 64 chars. `slugify` returns '' for all-punctuation input; callers that
 * need a non-empty default should fall back themselves (or pass one via
 * `fallback`).
 *
 * `nextCandidate` handles collision suffixing (`-2`, `-3`, ...) for slugs
 * that must be unique inside a scope (e.g. `listings.slug` is unique per
 * agent).
 *
 * Keep this dependency-free (no zod, no supabase) so it can run on both
 * client and server.
 */

export function slugify(input: string, opts?: { fallback?: string }): string {
  const cleaned = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, ' ') // strip diacritics & punctuation
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return cleaned || opts?.fallback || '';
}

export function nextCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  const room = 64 - suffix.length;
  return `${base.slice(0, room)}${suffix}`;
}
