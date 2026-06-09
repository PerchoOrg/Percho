/**
 * Slug helpers for `listings.slug`.
 *
 * Slugs are unique per agent (DB constraint `unique (agent_id, slug)`).
 * Derived from street address: lowercase, alphanumerics + hyphens, collapse
 * runs of non-alphanumerics, trim leading/trailing hyphens, cap to 64 chars.
 *
 * On collision we suffix `-2`, `-3`, ... up to a small cap. The agent can
 * rename the slug from the edit page later if they care.
 */

export function deriveSlug(input: string): string {
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
  return cleaned || 'listing';
}

export function nextCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  const room = 64 - suffix.length;
  return `${base.slice(0, room)}${suffix}`;
}
