/**
 * SiteFooter — minimal single-line footer.
 *
 * Kept intentionally bare per product call (2026-06-20): no link columns, no
 * brand block. Only the copyright + legal disclaimer line. Disclaimer stays
 * because real-estate platforms need Fair Housing + "not a broker" language
 * for listing-agent trust — removing it makes agents wary of uploading real
 * inventory. If we ever pull legal pages live again, link them inline here.
 */

export function SiteFooter() {
  return (
    <footer className="border-line border-t bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-10 text-center">
        <p className="text-[11px] leading-[1.7] text-ink2 tracking-[0.04em]">
          © 2026 Vicinity. All rights reserved. ·{' '}
          <span className="text-muted">
            Vicinity is a home-discovery platform, not a licensed real estate
            broker. Equal Housing Opportunity.
          </span>
        </p>
      </div>
    </footer>
  );
}
