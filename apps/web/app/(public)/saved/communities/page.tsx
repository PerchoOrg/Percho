import type { Metadata } from 'next';
/**
 * /saved/communities — Buyer's saved communities (Favorites · Communities sub-tab).
 *
 * Listings/Communities are now route segments so
 * the global TopBar can host them as sub-tabs.
 */
import { SavedClient } from '../_components/SavedClient';

export const metadata: Metadata = {
  title: 'Saved neighborhoods · Percho',
  description: 'Neighborhoods you have saved while browsing.',
};

export default function SavedCommunitiesPage() {
  return <SavedClient kind="communities" />;
}
