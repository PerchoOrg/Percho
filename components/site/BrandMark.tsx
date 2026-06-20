/**
 * BrandMark — global Vicinity wordmark used in SiteHeader and auth chrome.
 *
 * 2026-06-20 phase44.7: reverted to pure tracked-caps wordmark per product
 * call. The V monogram tile (phase44.5) was rejected as too logo-heavy;
 * editorial-luxury idiom favors a plain tracked wordmark (Aman / Hermès).
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
      className={`group inline-block rounded-md border border-transparent px-2 py-1.5 font-medium uppercase transition hover:border-[#c9a24a]/40 hover:bg-[#c9a24a]/5 focus-visible:border-[#c9a24a]/60 focus-visible:bg-[#c9a24a]/5 focus-visible:outline-none ${
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
