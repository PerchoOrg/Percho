/**
 * HubDetailShell — shared hero+tabs frame for the agent hub detail
 * pages (Phase 46).
 *
 * Layout:
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ Hero cover image                              [Active ▾]  │   ← StatusPill
 *   │   max-w-6xl, aspect-[5/2] md:aspect-[5/1]                 │
 *   │   bg-surface, sm:rounded-b-xl                             │
 *   ├───────────────────────────────────────────────────────────┤
 *   │  ▸ Details   Media   Social   Tour                        │   ← HubTabs (sticky)
 *   ├───────────────────────────────────────────────────────────┤
 *   │  panel content (auto-saved by EditListingForm etc.)       │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Hero ratio matches the buyer-facing community public page (phase 45.28),
 * so the same cover image renders identically across the dashboard and
 * the live `/c/<slug>` route — no surprise reframe on publish.
 *
 * Server component; clients (StatusPill, HubTabs) are passed as nodes.
 */

import type { ReactNode } from 'react';

import { HubTabs, type HubTab } from './HubTabs';

type Props = {
  /** Cover image URL. Falls back to a soft surface block. */
  coverUrl: string | null;
  /** Title rendered over the bottom-left of the hero. Optional —
   * many flows already show the title elsewhere (e.g. inside the
   * Details panel) so the hero can be image-only. */
  title?: string;
  /** Subtitle under the title. */
  subtitle?: string;
  /** Right-side overlay for status, share, etc. Typically the
   * <StatusPill /> component. */
  rightOverlay?: ReactNode;
  /** Tab definitions and matching panels. */
  tabs: HubTab[];
  panels: Record<string, ReactNode>;
  defaultTab?: string;
};

export function HubDetailShell({
  coverUrl,
  title,
  subtitle,
  rightOverlay,
  tabs,
  panels,
  defaultTab,
}: Props) {
  return (
    <>
      <header className="mx-auto max-w-6xl">
        <div className="relative aspect-[5/2] w-full overflow-hidden bg-surface md:aspect-[5/1] sm:rounded-b-xl">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted text-xs">
              No cover image yet
            </div>
          )}

          {/* Bottom gradient overlay for title legibility. */}
          {(title || subtitle) && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-6 sm:bottom-5">
                {title && (
                  <h1 className="font-serif text-2xl font-semibold text-surface drop-shadow sm:text-3xl">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-1 text-sm text-surface/90 drop-shadow">{subtitle}</p>
                )}
              </div>
            </>
          )}

          {/* Right-side overlay (status pill / share / etc.) */}
          {rightOverlay && (
            <div className="absolute right-3 top-3 sm:right-5 sm:top-5">{rightOverlay}</div>
          )}
        </div>
      </header>

      <HubTabs tabs={tabs} panels={panels} defaultTab={defaultTab} />
    </>
  );
}
