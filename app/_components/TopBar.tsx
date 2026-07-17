'use client';

/**
 * TopBar — global top bar across mobile + desktop.
 *
 * Layout (all breakpoints): [🔍 search] · [sub-tabs] · [avatar / sign-in]
 *
 * Phase 45 (2026-06-20): replaces the prior trio of overlapping mobile-only
 * pieces (SearchPill + TopRightAvatar + dashboard WorkspaceSubNav) with a
 * single chrome surface. Desktop uses the same component but pinned alongside
 * the new <DesktopSidebar> (left of it on md+, full-width on mobile).
 *
 * Search interaction (owner spec, 2026-06-20):
 *   click 🔍 → middle and right slots collapse, search input expands full-width
 *   inline. X to close. Submit → /search?q=…
 *
 * Sub-tabs come from getSubTabs(pathname, role) — Explore/Nearby on /browse
 * and /communities, Listings/Communities/Leads/Analytics on /dashboard, single
 * non-clickable label on /saved + /profile, nothing on routes that don't map.
 *
 * Hides via isChromeHidden (feed/auth/landing) — same rule as BottomNav.
 */

import { LogOut, Search, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  getSubTabs,
  isChromeHidden,
  isSubTabActive,
  type ViewerRole,
} from './nav-config';

export type TopBarProps = {
  role: ViewerRole;
  /** First letter shown in the avatar circle. */
  initial: string;
  /** Optional avatar URL — preset path or Supabase Storage public URL. */
  avatarUrl?: string | null;
};

export function TopBar({ role, initial, avatarUrl }: TopBarProps) {
  const pathname = usePathname() ?? '/';
  if (isChromeHidden(pathname)) return null;

  return (
    <header
      className="sticky top-0 z-40 border-line border-b bg-bg/85 backdrop-blur-md md:pl-[200px]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-6">
        <TopBarInner role={role} initial={initial} avatarUrl={avatarUrl} pathname={pathname} />
      </div>
    </header>
  );
}

function TopBarInner({
  role,
  initial,
  avatarUrl,
  pathname,
}: TopBarProps & { pathname: string }) {
  const [searching, setSearching] = useState(false);
  const subTabs = getSubTabs(pathname, role);

  if (searching) {
    return <SearchExpanded onClose={() => setSearching(false)} />;
  }

  return (
    <>
      {/* Left — search icon */}
      <button
        type="button"
        onClick={() => setSearching(true)}
        aria-label="Search"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 transition hover:text-ink"
      >
        <Search size={18} aria-hidden="true" />
      </button>

      {/* Middle — sub-tabs, or a centred section title on Nearby-less
        * pages (/browse and /communities post-Phase 66). */}
      <div className="min-w-0 flex-1">
        {subTabs ? (
          <SubTabRow tabs={subTabs} pathname={pathname} />
        ) : (
          <SectionTitle pathname={pathname} />
        )}
      </div>

      {/* Right — avatar / sign-in */}
      <div className="shrink-0">
        {role === 'anon' ? (
          <Link
            href="/login"
            className="inline-flex h-11 items-center px-3 font-medium text-ink2 text-sm transition hover:text-ink"
          >
            Log in
          </Link>
        ) : (
          <AvatarMenu initial={initial} avatarUrl={avatarUrl} role={role} />
        )}
      </div>
    </>
  );
}

function SectionTitle({ pathname }: { pathname: string }) {
  // Phase 66 (2026-07-02): centred title for pages that no longer expose
  // sub-tabs. /browse and /communities now show "Explore" centred here
  // (owner: 笑云 feedback — dropped Nearby sub-tab). Any other route with
  // no sub-tabs (e.g. /profile) renders nothing.
  let title: string | null = null;
  if (pathname === '/browse' || pathname.startsWith('/browse/')) {
    title = 'Explore';
  } else if (pathname === '/communities' || pathname.startsWith('/communities/')) {
    // The bottom-nav tab is "Neighborhood"; the middle slot on the
    // top-level page keeps the same visual verb the buyer expects.
    title = 'Explore';
  } else if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // Phase 102 (2026-07-17): admin label lives in the top bar middle
    // slot — the /admin layout used to render a separate standalone
    // "Admin" band beneath the TopBar; removed per owner.
    title = 'ADMIN';
  }
  if (!title) return null;
  return (
    <div className="flex w-full items-center justify-center">
      <span className="font-medium text-ink text-sm">{title}</span>
    </div>
  );
}

function SubTabRow({
  tabs,
  pathname,
}: {
  tabs: ReturnType<typeof getSubTabs> & object;
  pathname: string;
}) {
  // Phase 45.9 (2026-06-20): owner — "agent hub: by default sub tabs on top
  // should show full names from left, not the middle ones". Left-align all
  // sub-tab rows; full-name labels (no truncation), horizontal scroll if
  // they overflow on narrow screens.
  return (
    <nav
      aria-label="Section"
      className="flex items-center justify-start gap-5 overflow-x-auto"
    >
      {tabs.map((t) => {
        const active = isSubTabActive(pathname, t, tabs);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`relative whitespace-nowrap py-3 text-sm transition-colors ${
              active ? 'font-medium text-ink' : 'text-ink2 hover:text-ink'
            }`}
          >
            {t.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1.5 mx-auto h-px w-6 bg-ink"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SearchExpanded({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Phase 45.11 (2026-06-20, owner round 3): outside-click collapses the
  // search box. Listening on `mousedown` matches the avatar menu pattern.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onClose();
  }

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={onSubmit}
      role="search"
      className="flex w-full items-center gap-2"
    >
      <Search size={18} aria-hidden="true" className="shrink-0 text-ink2" />
      {/*
        * Phase 45.11 (2026-06-20, owner round 3): font-size pinned to 16px
        * (`text-base`) so iOS Safari does not auto-zoom on focus. Anything
        * <16px on a text input triggers the OS zoom behaviour.
        */}
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search homes, neighborhoods…"
        aria-label="Search"
        className="min-w-0 flex-1 bg-transparent text-ink text-base outline-none placeholder:text-muted"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 transition hover:text-ink"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

function AvatarMenu({
  initial,
  avatarUrl,
  role,
}: {
  initial: string;
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

  // Close menu on route change.
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
        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-bg font-medium text-ink text-sm transition active:scale-95"
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
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border-line border bg-bg shadow-2xl shadow-black/40 backdrop-blur-md"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-ink2 text-sm transition hover:bg-surface/5"
          >
            <User size={16} aria-hidden="true" />
            Profile
          </Link>
          {/* Phase 45.13 (2026-06-20): Agent Hub removed from dropdown — already
            * a primary tab in BottomNav/DesktopSidebar. Owner round 5 #3. */}
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
