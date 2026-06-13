/**
 * /saved — Buyer's saved listings.
 *
 * Phase 19 (2026-06-13). V1 placeholder:
 *   - Anon user → invitation to sign in
 *   - Authenticated buyer → empty-state copy ("Your saved listings will appear here")
 *
 * V2 (Phase TBD): wire to a `saved_listings` table and render a grid of
 * BrowseCard. For now this surface exists so the bottom-nav Saved tab has a
 * landing page; the in-feed heart in BrowseFeed remains in-memory only.
 */

import { createClient } from '@/lib/supabase/server';
import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Saved',
  description: 'Listings you have saved while browsing.',
};

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto min-h-[80vh] max-w-2xl px-5 pt-10 pb-24 md:pb-10">
      <h1 className="font-serif text-3xl text-cream">Saved</h1>
      <p className="mt-2 text-cream/60 text-sm">Listings you save while browsing show up here.</p>

      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border-cream/10 border border-dashed bg-ink/40 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
          <Heart size={26} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-serif text-cream text-xl">
          {user ? 'No saved listings yet' : 'Sign in to save listings'}
        </h2>
        <p className="mt-2 max-w-sm text-cream/60 text-sm">
          {user
            ? 'Tap the heart while watching a listing to save it for later.'
            : 'Create a free account to keep track of homes you love across sessions.'}
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/browse"
            className="rounded-full bg-gold px-5 py-2 font-medium text-ink text-sm transition hover:opacity-90"
          >
            Start browsing
          </Link>
          {!user ? (
            <Link
              href="/signup"
              className="rounded-full border-cream/20 border px-5 py-2 font-medium text-cream text-sm transition hover:border-cream/40"
            >
              Sign up
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
