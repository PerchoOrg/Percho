/**
 * FmlsDisclosure — the FMLS IDX disclosure (rule 13.7(e)) plus the
 * Technical Entity statement (rule 13.8). Wording lives in
 * `@percho/shared/fmls`; this only lays it out.
 *
 *   variant="results"  under any grid / list of listing previews
 *   variant="detail"   at the bottom of a single-listing view
 *
 * Render it only when an FMLS listing is on screen — callers gate on a
 * listing's `mlsNumber`. No hooks, so it works in server and client trees.
 */

import {
  FMLS_DMCA_URL,
  FMLS_RESULTS_DISCLOSURE,
  type LinkedText,
  TECHNICAL_ENTITY_STATEMENT,
  fmlsDetailDisclosure,
} from '@percho/shared/fmls';

export function FmlsDisclosure({
  variant,
  className = '',
}: {
  variant: 'results' | 'detail';
  className?: string;
}) {
  const text: LinkedText =
    variant === 'detail' ? fmlsDetailDisclosure(new Date().getFullYear()) : FMLS_RESULTS_DISCLOSURE;
  return (
    <div className={`space-y-1.5 text-[11px] leading-[1.6] text-ink2 ${className}`}>
      <p>
        {text.before}
        <a
          href={FMLS_DMCA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          {text.link}
        </a>
        {text.after}
      </p>
      <p>{TECHNICAL_ENTITY_STATEMENT}</p>
    </div>
  );
}
