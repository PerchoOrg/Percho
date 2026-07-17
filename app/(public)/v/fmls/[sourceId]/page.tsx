/**
 * Phase 94 (2026-07-17): external (FMLS) listing detail page.
 * Route: `/v/fmls/[sourceId]` — e.g. `/v/fmls/578964791`.
 *
 * Externally-sourced listings have `agent_id IS NULL` and carry provenance in
 * `(source, source_id)` + attribution in `external_agent_name/phone/office`.
 * We reuse the exact same VideoFeed as `/v/[agentSlug]/[listingSlug]` — the
 * only diffs are:
 *   - We look up the listing by (source='fmls', source_id).
 *   - The synthesised agent has `isExternal=true`, which flips the caption
 *     card from a link to plain text (no /a/{slug} to point at).
 *   - Metadata description uses "Listed by {name} · {office}".
 *
 * We keep the source as a hard-coded segment (rather than `[source]`) because
 * Next.js forbids two dynamic segments with different names at the same depth
 * (would collide with `[agentSlug]`). When we add a second external provider
 * we'll create `app/(public)/v/{provider}/[sourceId]/page.tsx` as a sibling.
 *
 * All FMLS import listings are photo-only (no walkthrough video); when we
 * wire in the ken-burns video-per-listing pipeline this route will start
 * producing a proper hero + neighbour tail like the internal one.
 */

import { fetchBrowseCards } from '@/lib/feed/browse-cards';
import {
  buildListingCards,
  loadListingFeedBySource,
  loadListingPhotos,
} from '@/lib/listing-feed/load';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VideoFeed } from '../../[agentSlug]/[listingSlug]/_components/VideoFeed';

export const revalidate = 3600;

const SOURCE = 'fmls';

type PageParams = { sourceId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { sourceId } = await params;
  const data = await loadListingFeedBySource(SOURCE, sourceId);
  if (!data) return { title: 'Listing not found · Percho' };
  const { listing, agent } = data;

  const title = `${listing.address} · ${listing.city}, ${listing.state}`;
  const priceText = listing.price ? `$${listing.price.toLocaleString()}` : null;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const attribution = agent.office
    ? `Listed by ${agent.name} · ${agent.office}`
    : `Listed by ${agent.name}`;
  const description = [priceText, specs, attribution].filter(Boolean).join(' — ');

  const imageUrl = listing.cover_url ?? null;
  const images = imageUrl ? [{ url: imageUrl, width: 1280, height: 720 }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/v/${SOURCE}/${sourceId}`,
      type: 'website',
      siteName: 'Percho',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function ExternalListingPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { sourceId } = await params;
  const data = await loadListingFeedBySource(SOURCE, sourceId);
  if (!data) notFound();

  const photos = await loadListingPhotos(data.listing.id);
  const cards = await buildListingCards(data, photos);
  const head = cards[0];
  if (!head) notFound();

  const exploreCards = await fetchBrowseCards();
  const tail = exploreCards.filter((c) => c.listing.id !== data.listing.id);

  return <VideoFeed listingId={data.listing.id} cards={[head, ...tail]} />;
}
