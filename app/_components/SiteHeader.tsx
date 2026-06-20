'use client';

/**
 * SiteHeader — desktop-only (md+) sticky top header with role-aware nav.
 *
 * Phase 26 (2026-06-14). Counterpart to <BottomNav>: when the viewport is
 * `md:` and up the bottom tab bar hides itself; this header takes over.
 *
 * Layout (left → right):
 *   - Brand: "Vicinity" (Playfair, links to `/`)
 *   - Primary nav: BUYER_TABS minus "Me" (anon/buyer), or
 *     AGENT_LEFT_TABS + AGENT_RIGHT_TABS minus "Me" (agent)
 *   - Right cluster:
 *       - agent → "+ New" dropdown (Listing / Community)
 *       - anon  → "Sign in" / "Sign up" pills
 *       - buyer/agent → avatar dropdown (Profile + Sign out)
 *
 * Hides on the same routes as BottomNav (feed, auth, landing).
 *
 * Role + initial are resolved by <SiteHeaderWrapper> on the server.
 */

import { Building2, ChevronDown, LogOut, Plus, User, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/site/BrandMark';
import {
  getPrimaryTabs,
  isChromeHidden,
  isTabActive,
  type Tab,
  type ViewerRole,
} from './nav-config';

export type SiteHeaderProps = {
  role: ViewerRole;
  /** First letter for the avatar circle (agent name or email local-part). */
  initial: string;
  /** Display name shown in the avatar dropdown (agent name or email). */
  displayName: string | null;
  brokerage: string | null;
  /** Optional avatar URL (preset path or Storage public URL). */
  avatarUrl?: string | null;
};

function NavLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`text-sm transition-colors ${
        active ? 'text-ink' : 'text-ink2 hover:text-ink'
      }`}
    >
      {tab.label}
    </Link>
  );
}

function NewDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 font-medium text-cream text-sm transition hover:opacity-90"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        New
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border-line border bg-bg shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          <Link
            href="/dashboard/listings/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/15 text-ink">
              <Building2 size={16} />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-ink text-sm">List a Property</span>
              <span className="text-ink2 text-xs">Add a home to your portfolio</span>
            </span>
          </Link>
          <Link
            href="/dashboard/communities"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 border-line border-t px-4 py-3 transition hover:bg-surface/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/15 text-ink">
              <Video size={16} />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-ink text-sm">Add Community Video</span>
              <span className="text-ink2 text-xs">Show what a place feels like</span>
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AvatarMenu({
  initial,
  displayName,
  brokerage,
  avatarUrl,
  role,
}: {
  initial: string;
  displayName: string | null;
  brokerage: string | null;
  avatarUrl?: string | null;
  role: ViewerRole;
}) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-bg font-medium text-ink text-sm transition hover:border-line-strong active:scale-95"
      >
        {avatarUrl ? (
          // biome-ignore lint/a11y/useAltText: aria-label on the button covers it
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial.toUpperCase()
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border-line border bg-bg shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          {displayName ? (
            <div className="border-line border-b px-4 py-3">
              <div className="truncate font-medium text-ink text-sm">{displayName}</div>
              {brokerage ? (
                <div className="truncate text-ink2 text-xs">{brokerage}</div>
              ) : null}
            </div>
          ) : null}
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-ink2 text-sm transition hover:bg-surface/5"
          >
            <User size={16} aria-hidden="true" />
            Profile
          </Link>
          {role === 'agent' ? (
            <>
              <Link
                href="/dashboard"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-line border-t px-4 py-3 text-ink2 text-sm transition hover:bg-surface/5"
              >
                <Building2 size={16} aria-hidden="true" />
                Dashboard
              </Link>
              <Link
                href="/dashboard/listings/new"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-line border-t px-4 py-3 text-ink2 text-sm transition hover:bg-surface/5"
              >
                <Plus size={16} aria-hidden="true" />
                New listing
              </Link>
            </>
          ) : null}
          <form action="/api/auth/signout" method="post" className="border-line border-t">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-ink2 text-sm transition hover:bg-surface/5"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader({ role, initial, displayName, brokerage, avatarUrl }: SiteHeaderProps) {
  const pathname = usePathname() ?? '/';

  if (isChromeHidden(pathname)) return null;

  // Phase 36: single set of primary tabs per role. Drop "Me" from inline nav
  // — it lives in the avatar dropdown on desktop. Also drop "Explore" since
  // it has its own brand-adjacent emphasis on mobile but doesn't need a
  // duplicate inline link on desktop where it's the most prominent route in
  // the top nav anyway. (Keep it in: simpler, fewer special cases.)
  const inline = getPrimaryTabs(role).filter((t) => t.href !== '/profile');
  const tabs = inline;

  return (
    <header
      className="sticky top-0 z-40 hidden border-line border-b bg-bg backdrop-blur-md md:block"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-7">
          <BrandMark href={role === 'agent' ? '/dashboard' : '/'} />
          <nav aria-label="Primary" className="flex items-center gap-5">
            {tabs.map((tab) => (
              <NavLink key={tab.href} tab={tab} active={isTabActive(pathname, tab)} />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {role === 'agent' ? <NewDropdown /> : null}
          {role === 'anon' ? (
            <>
              <Link
                href="/login"
                className="text-ink2 text-sm transition hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-full bg-ink px-4 font-medium text-cream text-sm transition hover:opacity-90"
              >
                Sign up
              </Link>
            </>
          ) : (
            <AvatarMenu initial={initial} displayName={displayName} brokerage={brokerage} avatarUrl={avatarUrl} role={role} />
          )}
        </div>
      </div>
    </header>
  );
}
