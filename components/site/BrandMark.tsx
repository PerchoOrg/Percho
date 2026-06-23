/**
 * BrandMark — global Vicinity wordmark used in SiteHeader and auth chrome.
 *
 * 2026-06-20 phase44.7: reverted to pure tracked-caps wordmark per product
 * call. The V monogram tile (phase44.5) was rejected as too logo-heavy;
 * editorial-luxury idiom favors a plain tracked wordmark (Aman / Hermès).
 *
 * 2026-06-23: stripped the hover button chrome (rounded box + gold
 * border/tint on hover). It read as a tiny CTA in the auth-page corner and
 * clashed with the cream/gold editorial idiom. Match the landing hero
 * eyebrow (app/page.tsx) exactly — flat tracked caps, hover signals via
 * subtle brightness only. No padding box, no border, no fill.
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
      className={`inline-block font-medium uppercase transition hover:brightness-110 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${
        className ?? ''
      }`}
      style={{
        color: '#c9a24a',
        letterSpacing: '0.32em',
        fontSize: '13px',
      }}
    >
      VICINITY
    </Link>
  );
}
