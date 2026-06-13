/**
 * Slug helpers — used wherever a human-entered name needs to become a
 * URL-safe identifier (community slug, etc.).
 *
 * Phase 17 — extracted from NewCommunityForm so server actions can derive
 * slugs when the agent renames a community without retyping the slug.
 *
 * Keep this dependency-free (no zod, no supabase) so it can run on both
 * client and server.
 */

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}
