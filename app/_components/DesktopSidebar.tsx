'use client';

/**
 * DesktopSidebar — md+ left vertical rail.
 *
 * Phase 45 (2026-06-20). Vertical sidebar pinned to the left edge. Primary
 * tabs as a vertical column.
 *
 * Phase 45.9 (2026-06-20): VICINITY brandmark removed per owner. Agent
 * "+ New" promoted to the first slot (top-left). + New now opens the same
 * Choose-from-album / Video / Photo source picker the mobile UploadFAB
 * uses (shared via useUploadSheet hook).
 *
 * Mobile (<md) hides itself — BottomNav handles primary nav there. Hides on
 * the same routes as BottomNav (feed/auth/landing) via isChromeHidden.
 *
 * Width: 200px fixed. Layout uses md:pl-[200px] on TopBar + main content.
 */

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  getPrimaryTabs,
  isChromeHidden,
  isTabActive,
  type Tab,
  type ViewerRole,
} from './nav-config';
import { useUploadSheet } from './UploadSheet';

export type DesktopSidebarProps = {
  role: ViewerRole;
};

export function DesktopSidebar({ role }: DesktopSidebarProps) {
  const pathname = usePathname() ?? '/';
  if (isChromeHidden(pathname)) return null;

  const tabs = getPrimaryTabs(role);

  return (
    <aside
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-50 hidden w-[200px] flex-col border-line border-r bg-bg md:flex"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3 pt-5">
        {role === 'agent' ? <NewButton /> : null}
        {tabs.map((tab) =>
          tab.fab ? null : (
            <SidebarLink key={tab.href} tab={tab} active={isTabActive(pathname, tab)} />
          ),
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'bg-surface/30 font-medium text-ink'
          : 'text-ink2 hover:bg-surface/20 hover:text-ink'
      }`}
    >
      <Icon size={18} aria-hidden="true" strokeWidth={active ? 1.75 : 1.5} />
      <span>{tab.label}</span>
    </Link>
  );
}

/**
 * NewButton — agent-only sidebar "+ New" trigger. Opens the shared upload
 * picker (Choose from album / Video / Photo) → type picker → routes to
 * /dashboard/<type>/new with prefill. Same flow as the mobile FAB.
 */
function NewButton() {
  const { open, portal } = useUploadSheet();
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-3 rounded-lg bg-ink px-3 py-2.5 font-medium text-cream text-sm transition-colors hover:opacity-90"
      >
        <Plus size={18} aria-hidden="true" strokeWidth={1.75} />
        <span>+ New</span>
      </button>
      {portal}
    </>
  );
}
