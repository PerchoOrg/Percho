/**
 * SiteFooter — minimal single-line footer: copyright + Fair Housing
 * "not a broker" disclaimer. The disclaimer stays because real-estate
 * platforms need it for listing-agent trust. The second line is FMLS IDX
 * rule 13.8's Technical Entity statement (phase307).
 */

import { TECHNICAL_ENTITY_STATEMENT } from '@percho/shared/fmls';

export function SiteFooter() {
  return (
    <footer className="border-line border-t bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-10 text-center">
        <p className="text-[11px] leading-[1.7] text-ink2 tracking-[0.04em]">
          © 2026 Percho. All rights reserved. ·{' '}
          <span className="text-muted">
            Percho is a home-discovery platform, not a licensed real estate broker. Equal Housing
            Opportunity.
          </span>
        </p>
        <p className="mt-1 text-[11px] leading-[1.7] text-muted tracking-[0.04em]">
          {TECHNICAL_ENTITY_STATEMENT}
        </p>
      </div>
    </footer>
  );
}
