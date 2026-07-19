'use client';

/**
 * HubTabs — sticky sub-tab bar for the Phase 46 agent hub detail shell.
 *
 * Lives directly under the hero. Click switches the rendered panel via
 * URL `?tab=...` (router.replace, scroll: false — no server nav, no
 * scroll jump). Hash deep links also accepted on mount.
 *
 * Two visual modes, picked automatically per call site:
 *   - **Pill mode** (default, when no tab carries an `icon`):
 *     horizontally-scrollable text pills with active underline. Used by
 *     the community detail hub and any consumer that hasn't opted in
 *     to icons. Behaviour is unchanged from the original component.
 *   - **Chip mode** (when at least one tab carries an `icon`):
 *     horizontally-scrollable circular icon chips with a label below.
 *     Used by the my-listing agent hub (Phase 48) so the 5 tabs read as
 *     destinations rather than text pills, are visually distinct from
 *     the BottomNav text pills, and remain identical desktop ↔ mobile.
 *     Mobile shows ~4.5 chips with a soft right-edge fade hinting at
 *     scrollability.
 *
 * Renders a single sticky bar plus the matching panel. The caller owns
 * the panel content via a `panels` map keyed by tab id.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useMemo } from 'react';

export type HubTab = {
  id: string;
  label: string;
  /** Optional leading icon. When provided, HubTabs switches to chip mode. */
  icon?: ReactNode;
};

export function HubTabs({
  tabs,
  panels,
  defaultTab,
  eagerMount = false,
}: {
  tabs: HubTab[];
  panels: Record<string, ReactNode>;
  defaultTab?: string;
  /**
   * When true, render every panel in the DOM and toggle visibility with
   * `display:none`. Default is the historical lazy behaviour where only
   * the active panel is mounted. Phase 50.17 (2026-06-23): the community
   * hub turns this on so the Media tab can auto-consume queued prefill
   * files from the FAB while the agent edits the Details tab — without
   * visiting the Media tab first.
   */
  eagerMount?: boolean;
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

  // Chip mode if any tab opts in by passing an `icon`. Mixed icon/no-icon
  // is supported but the consumer should provide icons for all tabs.
  const chipMode = tabs.some((t) => t.icon !== undefined);

  return (
    <>
      {/* Sticky tab bar — sits under the BottomNav-relative header so
       * the user can switch tabs while scrolling through long panels. */}
      <div className="sticky top-0 z-20 border-line border-b bg-bg/95 backdrop-blur">
        {chipMode ? (
          <div
            className="mx-auto flex max-w-6xl items-start gap-3 overflow-x-auto px-3 py-3 sm:gap-5 sm:px-6 sm:py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] sm:[mask-image:none]"
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
                  className={`group flex w-16 shrink-0 flex-col items-center gap-1.5 bg-transparent text-center text-[11.5px] leading-tight transition sm:w-20 sm:text-xs ${
                    isActive ? 'font-semibold text-ink' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  <span
                    className={`relative flex items-center justify-center rounded-full border bg-surface transition ${
                      isActive
                        ? 'h-14 w-14 border-2 border-ink bg-cream shadow-[0_2px_10px_rgba(49,49,49,0.12)] sm:h-16 sm:w-16'
                        : 'h-14 w-14 border-line group-hover:-translate-y-0.5 group-hover:border-ink2 sm:h-16 sm:w-16'
                    }`}
                    aria-hidden
                  >
                    {t.icon}
                  </span>
                  <span className="line-clamp-1">{t.label}</span>
                  <span
                    className={`h-0.5 w-4 rounded-full transition ${
                      isActive ? 'bg-ink' : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        ) : (
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
                    isActive ? 'font-medium text-ink' : 'text-ink2 hover:text-ink'
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
        )}
      </div>

      <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        {eagerMount
          ? tabs.map((t) => (
              <div
                key={t.id}
                role="tabpanel"
                aria-hidden={t.id !== activeId}
                hidden={t.id !== activeId}
              >
                {panels[t.id] ?? null}
              </div>
            ))
          : (panels[activeId] ?? null)}
      </div>
    </>
  );
}
