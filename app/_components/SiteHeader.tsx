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
import {
  AGENT_LEFT_TABS,
  AGENT_RIGHT_TABS,
  BUYER_TABS,
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
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={`text-sm transition-colors ${
        active ? 'text-gold' : 'text-cream/70 hover:text-cream'
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
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 font-medium text-ink text-sm transition hover:opacity-90"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        New
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border-cream/15 border bg-ink/95 shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          <Link
            href="/dashboard/listings/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-cream/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Building2 size={16} />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-cream text-sm">List a Property</span>
              <span className="text-cream/60 text-xs">Add a home to your portfolio</span>
            </span>
          </Link>
          <Link
            href="/dashboard/communities"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 border-cream/10 border-t px-4 py-3 transition hover:bg-cream/5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Video size={16} />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-cream text-sm">Add Community Video</span>
              <span className="text-cream/60 text-xs">Show what a place feels like</span>
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
}: {
  initial: string;
  displayName: string | null;
  brokerage: string | null;
  avatarUrl?: string | null;
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
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-gold/60 bg-ink/80 font-medium text-cream text-sm transition hover:border-gold active:scale-95"
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
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border-cream/15 border bg-ink/95 shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          {displayName ? (
            <div className="border-cream/10 border-b px-4 py-3">
              <div className="truncate font-medium text-cream text-sm">{displayName}</div>
              {brokerage ? (
                <div className="truncate text-cream/60 text-xs">{brokerage}</div>
              ) : null}
            </div>
          ) : null}
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-cream/90 text-sm transition hover:bg-cream/5"
          >
            <User size={16} aria-hidden="true" />
            Profile
          </Link>
          <form action="/api/auth/signout" method="post" className="border-cream/10 border-t">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-cream/80 text-sm transition hover:bg-cream/5"
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

  // Drop "Me" from inline nav — it lives in the avatar dropdown on desktop.
  const buyerInline = BUYER_TABS.filter((t) => t.href !== '/profile');
  const agentInline = [...AGENT_LEFT_TABS, ...AGENT_RIGHT_TABS].filter((t) => t.href !== '/profile');
  const tabs = role === 'agent' ? agentInline : buyerInline;

  return (
    <header
      className="sticky top-0 z-40 hidden border-cream/10 border-b bg-ink/85 backdrop-blur-md md:block"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-7">
          <Link
            href={role === 'agent' ? '/dashboard' : '/'}
            prefetch={false}
            className="font-serif text-cream text-xl tracking-tight transition hover:opacity-90"
          >
            Vicinity
          </Link>
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
                className="text-cream/80 text-sm transition hover:text-cream"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center rounded-full bg-gold px-4 font-medium text-ink text-sm transition hover:opacity-90"
              >
                Sign up
              </Link>
            </>
          ) : (
            <AvatarMenu initial={initial} displayName={displayName} brokerage={brokerage} avatarUrl={avatarUrl} />
          )}
        </div>
      </div>
    </header>
  );
}
