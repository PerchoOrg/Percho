import type { Metadata } from 'next';
/**
 * /saved — Buyer's saved listings.
 *
 * Phase 21 (2026-06-13): persistent saves keyed by anonymous device id.
 * Reads `vicinity_device_id` from localStorage, calls `listSavedListings`
 * server action, renders the same Pinterest-style grid as `/browse`.
 *
 * Future buyer-login phase: when a user is authenticated, this page
 * also pulls saves keyed on `user_id` (server-side, no localStorage)
 * and displays a unified set.
 */
import { SavedClient } from './_components/SavedClient';

export const metadata: Metadata = {
  title: 'Favorites · Vicinity',
  description: 'Listings and communities you have saved or liked while browsing.',
};

export default function SavedPage() {
  return <SavedClient />;
}
