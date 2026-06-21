'use client';

/**
 * MarketingPanel — combined Social + Tour tab (Phase 47.6).
 *
 * Tab originally split into "Social" and "Tour" tabs. Owner feedback:
 * 5 sibling tabs are easier to scan than 6, and Social+Tour are both
 * "outbound marketing" content (copy + script), so they belong together.
 *
 * Internal sub-tabs use plain client state — no URL persistence to keep
 * the parent's `?tab=marketing` URL clean. If a deep link is needed later,
 * read `marketing_sub` from searchParams here.
 */

import { useState, type ReactNode } from 'react';

type SubTabId = 'social' | 'tour';

const SUB_TABS: Array<{ id: SubTabId; label: string; hint: string }> = [
  { id: 'social', label: 'Social copy', hint: 'Facebook + Instagram drafts' },
  { id: 'tour', label: 'Home tour script', hint: 'Walkthrough talking points' },
];

export function MarketingPanel({
  socialPanel,
  tourPanel,
}: {
  socialPanel: ReactNode;
  tourPanel: ReactNode;
}) {
  const [active, setActive] = useState<SubTabId>('social');
  const activeMeta = SUB_TABS.find((t) => t.id === active);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-center gap-1">
          {SUB_TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  isActive
                    ? 'bg-ink text-surface'
                    : 'text-ink2 hover:bg-line/40'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {activeMeta && (
          <span className="text-muted text-xs">{activeMeta.hint}</span>
        )}
      </div>

      <div hidden={active !== 'social'}>{socialPanel}</div>
      <div hidden={active !== 'tour'}>{tourPanel}</div>
    </section>
  );
}
