'use client';

/**
 * BottomNav — mobile-only fixed bottom tab bar.
 *
 * 4-slot flat layout, single shape for all roles:
 *   Community · Explore · {Saved|Workspace} · Me
 *
 * Phase 19 (2026-06-13): introduced 5-slot mobile nav.
 * Phase 26 (2026-06-14): tab definitions moved to `nav-config.ts`.
 * Phase 27 (2026-06-16): dropped "Home" tab, buyer center became the
 *   emphasized Explore FAB. Community promoted to leftmost slot.
 * Phase 35.3 (2026-06-17): added a separate Explore tab to the agent nav so
 *   agents could see the buyer-side feed. Asymmetric 6-slot bar — wrong
 *   shape, surfaced by Tianrou.
 * Phase 36 (2026-06-18): rolled 35.3 back. Unified IA — agents share the
 *   buyer's 5-slot nav with Explore in the center.
 * Phase 37 (2026-06-18): collapsed "Nearby" tab into Explore sub-nav, dropped
 *   the center FAB visual. Bar is now a flat 4-icon strip — see
 *   `nav-config.ts` for the full rationale.
 *
 * Hides itself on:
 *   - `md:` and up (desktop uses SiteHeader)
 *   - feed routes (`/v/...`, `/browse/feed`) — immersive
 *   - auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
 *   - landing (`/`)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  getPrimaryTabs,
  isChromeHidden,
  isTabActive,
  type Tab,
  type ViewerRole,
} from './nav-config';

export type { ViewerRole } from './nav-config';

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
        active ? 'text-gold' : 'text-cream/65 hover:text-cream'
      }`}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="leading-none">{tab.label}</span>
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
      className="fixed inset-x-0 bottom-0 z-40 border-cream/10 border-t bg-ink/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <TabButton tab={tab} active={isTabActive(pathname, tab)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
