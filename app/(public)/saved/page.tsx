import type { Metadata } from 'next';
/**
 * /saved — Buyer's saved listings (Favorites · Listings sub-tab).
 *
 * persistent saves keyed by anonymous device id.
 * Listings/Communities split into route segments
 * so the global TopBar can host them as sub-tabs (see nav-config.getSubTabs).
 */
import { SavedClient } from './_components/SavedClient';

export const metadata: Metadata = {
  title: 'Favorites · Percho',
  description: 'Listings and neighborhoods you have saved or liked while browsing.',
};

export default function SavedPage() {
  return <SavedClient kind="listings" />;
}
