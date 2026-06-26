/**
 * EmptyHubState — shared empty state chrome for hub-style list pages.
 *
 * Phase 57 (2026-06-26): introduced for agent-side hubs (My Listing,
 * My Community).
 * Phase 58 (2026-06-26): promoted to app/_components/ and reused on
 * buyer surfaces (For You /browse, /communities) so all four list
 * pages share the same icon-disc + headline + sub copy. CTA is
 * optional — buyers don't create listings or communities, so on
 * those surfaces the dashed-border card stands alone.
 *
 * Visual: a centered icon disc, a one-line headline, a one-line
 * subhead, and an optional ink pill button as the primary CTA. The
 * CTA itself is supplied by the caller (so it can wire the right
 * server action) — this component owns the chrome only.
 */

import type { ReactNode } from 'react';

export function EmptyHubState({
  icon,
  headline,
  sub,
  cta,
}: {
  icon: ReactNode;
  headline: string;
  sub: string;
  cta?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-ink/5 text-ink2">
        {icon}
      </div>
      <h2 className="font-semibold text-ink text-base">{headline}</h2>
      <p className="mt-1.5 text-ink2 text-sm">{sub}</p>
      {cta ? <div className="mt-6">{cta}</div> : null}
    </div>
  );
}

/**
 * Shared pill-button styling for hub empty-state CTAs. Keeps Listing /
 * Community / future Leads visually identical without a wrapper component.
 */
export const HUB_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-medium text-sm text-surface transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60';
