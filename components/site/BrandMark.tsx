/**
 * BrandMark — global Vicinity wordmark used in SiteHeader and auth chrome.
 *
 * 2026-06-20 phase44.7: reverted to pure tracked-caps wordmark per product
 * call. The V monogram tile (phase44.5) was rejected as too logo-heavy;
 * editorial-luxury idiom favors a plain tracked wordmark (Aman / Hermès).
 *
 * 2026-06-23 phase50.13: stripped the hover button chrome (rounded box +
 * gold border/tint on hover). It read as a tiny CTA in the auth-page corner.
 *
 * 2026-06-23 phase50.14: dropped the gold fill. Auth pages use only
 * cream + ink (`--bg` / `--ink`) — no other gold is on those surfaces, so
 * a gold corner mark stuck out as the only chromatic accent. Wordmark now
 * uses `--ink` to match the H1, the Continue button, and the Sign-up link.
 * Landing hero eyebrow (`app/page.tsx`) keeps its gold — different surface,
 * different component, video background needs the chromatic pop.
 *
 * Note: on the landing page the eyebrow lives centered above the H1 (see
 * app/page.tsx) — that surface does NOT use BrandMark because it isn't a
 * link-back-to-home; it's a hero brand label. BrandMark is for chrome
 * (SiteHeader, auth layout) where it links to /.
 */

import Link from 'next/link';

type Props = {
  href?: string;
  className?: string;
};

export function BrandMark({ href = '/', className }: Props) {
  return (
    <Link
      href={href}
      aria-label="Vicinity — home"
      className={`inline-block font-medium uppercase text-ink transition hover:opacity-70 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${
        className ?? ''
      }`}
      style={{
        letterSpacing: '0.32em',
        fontSize: '13px',
      }}
    >
      VICINITY
    </Link>
  );
}
