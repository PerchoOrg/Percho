'use client';

/**
 * BottomNav — mobile-only fixed bottom tab bar.
 *
 * 4-slot flat layout, single shape for all roles:
 *   Community · Explore · {Saved|Workspace} · Me
 *
 * introduced 5-slot mobile nav.
 * tab definitions moved to `nav-config.ts`.
 * dropped "Home" tab, buyer center became the
 *   emphasized Explore FAB. Community promoted to leftmost slot.
 * added a separate Explore tab to the agent nav so
 *   agents could see the buyer-side feed. Asymmetric 6-slot bar — wrong
 *   shape, surfaced by Tianrou.
 * rolled 35.3 back. Unified IA — agents share the
 *   buyer's 5-slot nav with Explore in the center.
 * collapsed "Nearby" tab into Explore sub-nav, dropped
 *   the center FAB visual. Bar is now a flat 4-icon strip — see
 *   `nav-config.ts` for the full rationale.
 *
 * Hides itself on:
 *   - `md:` and up (desktop uses DesktopSidebar)
 *   - feed routes (`/v/...`, `/browse/feed`) — immersive
 *   - auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
 *   - landing (`/`)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UploadFAB } from './UploadFAB';
import {
  type Tab,
  type ViewerRole,
  getPrimaryTabs,
  isChromeHidden,
  isTabActive,
} from './nav-config';

export type { ViewerRole } from './nav-config';

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
        active ? 'font-medium text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {/* Aman idiom: 1px ink hairline above the active tab. Cream-on-cream
          color contrast alone wasn't readable (Tianrou, 2026-06-18). */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-1/2 h-px w-8 -translate-x-1/2 bg-ink"
        />
      )}
      <Icon size={20} aria-hidden="true" strokeWidth={active ? 1.75 : 1.25} />
      <span className="leading-none tracking-wide">{tab.label}</span>
    </Link>
  );
}

export function BottomNav({ role }: { role: ViewerRole }) {
  const pathname = usePathname() ?? '/';

  if (isChromeHidden(pathname)) return null;

  const tabs = getPrimaryTabs(role);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-line border-t bg-bg backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            {tab.fab ? <UploadFAB /> : <TabButton tab={tab} active={isTabActive(pathname, tab)} />}
          </li>
        ))}
      </ul>
    </nav>
  );
}
