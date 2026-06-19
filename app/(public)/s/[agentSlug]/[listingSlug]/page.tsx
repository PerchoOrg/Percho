/**
 * Public showcase poster page — `/s/[agentSlug]/[listingSlug]?style=1|2|3|4`.
 *
 * Phase 39 (2026-06-19): mobile-first share landing pages, four deliberate
 * visual styles. Reuses the same loader as `/v/`, filters to published-only.
 *
 * Why a separate route: `/v/` is the swipe feed (stitched into `/browse`);
 * `/s/` is a single-listing landing page designed to be shared / forwarded /
 * screenshotted. Different IA, different layout, different OG image.
 *
 * All media routes through `lib/demo-media.ts` (see `_components/shared.ts`).
 */

import { loadListingFeedBySlug, loadListingPhotos } from '@/lib/listing-feed/load';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Style1Editorial } from './_components/Style1';
import { Style2Cinematic } from './_components/Style2';
import { Style4LuxuryBrochure } from './_components/Style4';
import { buildShowcaseData } from './_components/shared';

export const revalidate = 3600;

type PageParams = { agentSlug: string; listingSlug: string };
type PageSearch = { style?: string };

function resolveStyle(raw: string | undefined): 1 | 2 | 4 {
  const n = Number(raw);
  if (n === 2 || n === 4) return n;
  // Style 3 (Minimal Poster) was retired in phase 40 — its share-as-image
  // use case is now served by the per-style downloadable poster PNGs.
  // Any leftover ?style=3 link falls through to the Editorial default.
  return 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { agentSlug, listingSlug } = await params;
  const data = await loadListingFeedBySlug(agentSlug, listingSlug);
  if (!data) return { title: 'Listing not found · Vicinity' };
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
  const description = [priceText, specs, `Listed by ${agent.name}`].filter(Boolean).join(' — ');
  const url = `/s/${agentSlug}/${listingSlug}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Vicinity',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ShowcasePosterPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<PageSearch>;
}) {
  const { agentSlug, listingSlug } = await params;
  const { style: styleRaw } = await searchParams;
  const style = resolveStyle(styleRaw);

  const bundle = await loadListingFeedBySlug(agentSlug, listingSlug);
  if (!bundle) notFound();

  const photos = await loadListingPhotos(bundle.listing.id);
  const data = buildShowcaseData(bundle, photos);

  // Community slug is not on the loaded `community` shape — one-off lookup
  // so the "View community details →" link can render. Tolerates miss.
  let communitySlug: string | null = null;
  if (bundle.community) {
    const supabase = await createClient();
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const res = (await (supabase as any)
      .from('communities')
      .select('slug')
      .eq('id', bundle.community.id)
      .maybeSingle()) as { data: { slug: string } | null };
    communitySlug = res.data?.slug ?? null;
  }

  switch (style) {
    case 2:
      return <Style2Cinematic data={data} communitySlug={communitySlug} />;
    case 4:
      return <Style4LuxuryBrochure data={data} communitySlug={communitySlug} />;
    default:
      return <Style1Editorial data={data} communitySlug={communitySlug} />;
  }
}
