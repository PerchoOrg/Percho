/**
 * BrandMark — tracked-caps Percho wordmark used as a link back to `/` in
 * chrome (auth layout corner). Uses `--ink` on cream — no gold, no box.
 *
 * The landing hero eyebrow (`app/page.tsx`) is a separate label — it isn't
 * a home link and needs gold on the video background — so it doesn't use
 * this component.
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
      aria-label="Percho — home"
      className={`inline-block font-medium uppercase text-ink transition hover:opacity-70 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${
        className ?? ''
      }`}
      style={{
        letterSpacing: '0.32em',
        fontSize: '13px',
      }}
    >
      PERCHO
    </Link>
  );
}
