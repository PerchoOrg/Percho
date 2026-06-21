'use client';

/**
 * HubTabs — sticky sub-tab bar for the Phase 46 agent hub detail shell.
 *
 * Lives directly under the hero. Click switches the rendered panel via
 * URL `?tab=...` (router.replace, scroll: false — no server nav, no
 * scroll jump). Hash deep links also accepted on mount.
 *
 * Mobile: horizontally-scrollable pill row.
 * Desktop: spaced inline pill row with active underline.
 *
 * Renders a single sticky bar plus the matching panel. The caller owns
 * the panel content via a `panels` map keyed by tab id.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, type ReactNode } from 'react';

export type HubTab = {
  id: string;
  label: string;
};

export function HubTabs({
  tabs,
  panels,
  defaultTab,
}: {
  tabs: HubTab[];
  panels: Record<string, ReactNode>;
  defaultTab?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fallback = defaultTab ?? tabs[0]?.id ?? '';

  const activeId = useMemo(() => {
    const t = searchParams.get('tab');
    if (t && tabs.some((x) => x.id === t)) return t;
    return fallback;
  }, [searchParams, tabs, fallback]);

  const onSelect = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === fallback) params.delete('tab');
      else params.set('tab', id);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams, fallback],
  );

  return (
    <>
      {/* Sticky tab bar — sits under the BottomNav-relative header so
       * the user can switch tabs while scrolling through long panels. */}
      <div className="sticky top-0 z-20 border-line border-b bg-bg/95 backdrop-blur">
        <div
          className="mx-auto flex max-w-6xl items-stretch overflow-x-auto px-3 sm:px-6"
          role="tablist"
          aria-label="Hub sections"
        >
          {tabs.map((t) => {
            const isActive = t.id === activeId;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(t.id)}
                className={`relative shrink-0 px-4 py-3 text-sm transition ${
                  isActive
                    ? 'font-medium text-ink'
                    : 'text-ink2 hover:text-ink'
                }`}
              >
                {t.label}
                {isActive && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        {panels[activeId] ?? null}
      </div>
    </>
  );
}
