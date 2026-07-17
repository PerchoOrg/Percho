'use client';

/**
 * AdminHubTabs — chip-mode tab bar for the /admin console.
 *
 * Visually identical to the agent hub `HubTabs` chip mode (Phase 48),
 * but the navigation model differs: each admin tab is a real route
 * (its own server component with independent data-fetching), so we
 * use pathname-based routing + <Link> instead of `?tab=` state.
 *
 * Identical layout mobile ↔ desktop (matches agent-hub parity ask).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type AdminHubTab = {
  id: string;
  label: string;
  /** Route href. Active when pathname starts with this prefix. */
  href: string;
  icon: ReactNode;
};

export function AdminHubTabs({ tabs }: { tabs: AdminHubTab[] }) {
  const pathname = usePathname() ?? '';

  const active =
    tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)) ?? tabs[0];

  return (
    <div className="sticky top-0 z-20 border-line border-b bg-bg/95 backdrop-blur">
      <div
        className="mx-auto flex max-w-6xl items-start gap-3 overflow-x-auto px-3 py-3 sm:gap-5 sm:px-6 sm:py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] sm:[mask-image:none]"
        role="tablist"
        aria-label="Admin sections"
      >
        {tabs.map((t) => {
          const isActive = t.id === active?.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              role="tab"
              aria-selected={isActive}
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
              <span className="line-clamp-2">{t.label}</span>
              <span
                className={`h-0.5 w-4 rounded-full transition ${
                  isActive ? 'bg-ink' : 'bg-transparent'
                }`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
