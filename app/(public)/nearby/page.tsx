/**
 * `/nearby` — placeholder for Phase 11.
 *
 * Phase 13 (2026-06-12) ships only the route shell so the BottomNav tab
 * doesn't 404. Phase 11 will replace this with:
 *   - geolocation permission flow
 *   - distance slider (default 10mi, 5/10/25/50)
 *   - feed of community videos + listings within radius
 *
 * Keeping the placeholder explicit so the route exists in production but the
 * UX is honest about being incomplete.
 */

import { Logo } from '@/app/_components/Logo';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nearby · Vicinity',
  description: 'Listings and community videos near you.',
};

export default function NearbyPage() {
  return (
    <main className="min-h-dvh bg-ink text-cream pb-20 md:pb-0">
      <header className="sticky top-0 z-20 flex items-center justify-between border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md">
        <Logo variant="overlay" />
        <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Nearby</div>
        <div className="w-9" aria-hidden="true" />
      </header>

      <section className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mb-3 text-gold text-xs uppercase tracking-[0.3em]">Coming soon</div>
        <h1 className="font-serif text-3xl text-cream">Nearby</h1>
        <p className="mt-4 text-cream/70 text-sm leading-relaxed">
          Find listings and community tours within a few miles of where you are. We&apos;re wiring
          up the geolocation flow next — it&apos;ll default to a 10-mile radius and let you dial it
          in.
        </p>
        <div className="mt-8">
          <Link
            href="/browse"
            className="btn-gold inline-flex items-center justify-center rounded-full px-6 py-3 text-sm"
          >
            Browse all listings
          </Link>
        </div>
      </section>
    </main>
  );
}
