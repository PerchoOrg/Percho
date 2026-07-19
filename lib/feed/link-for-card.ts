/**
 * single source of truth for browse-card detail URLs.
 *
 * Internal listings (owned by a Percho agent) route as
 *   /v/{agent.slug}/{listing.slug}
 *
 * External listings (FMLS import, no Percho agent) route as
 *   /v/fmls/{listing.sourceId}
 *
 * Every callsite that used to hand-roll `/v/${card.agent.slug}/${card.listing.slug}`
 * should call this helper instead so we don't leak `/v//foo` (empty slug) for
 * externals or drop the fmls-only path when we add more sources.
 */
export function linkForCard(card: {
  agent: { slug: string; isExternal?: boolean };
  listing: { slug: string; source?: string | null; sourceId?: string | null };
}): string {
  const src = card.listing.source;
  if (card.agent.isExternal || (src && card.listing.sourceId)) {
    // External: route by source + sourceId, ignore the empty agent.slug.
    return `/v/${src}/${card.listing.sourceId}`;
  }
  return `/v/${card.agent.slug}/${card.listing.slug}`;
}
