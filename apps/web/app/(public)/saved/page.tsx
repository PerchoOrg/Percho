import { LISTINGS_ON_WEB } from '@/lib/listings/listings-on-web';
import type { Metadata } from 'next';
/**
 * /saved — Buyer's saved listings (Favorites · Listings sub-tab).
 *
 * Saves live on the signed-in account (phase311).
 * Listings/Communities split into route segments
 * so the global TopBar can host them as sub-tabs (see nav-config.getSubTabs).
 */
import { SavedClient } from './_components/SavedClient';

export const metadata: Metadata = {
  title: 'Favorites · Percho',
  description: 'Listings and neighborhoods you have saved or liked while browsing.',
};

export default function SavedPage() {
  // Listings are off on the web (phase311): Favorites is neighbourhoods.
  return <SavedClient kind={LISTINGS_ON_WEB ? 'listings' : 'communities'} />;
}
