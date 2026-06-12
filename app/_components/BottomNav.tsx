'use client';

/**
 * BottomNav — mobile-only fixed bottom tab bar.
 *
 * Phase 13 (2026-06-12). Two role variants:
 *   - anon / buyer  → Browse · Nearby · Profile
 *   - agent         → Browse · Nearby · New Listing · Community · Dashboard · Leads · Profile
 *
 * Hides itself on:
 *   - `md:` and up (desktop uses SiteHeader / TopBar nav)
 *   - feed routes (`/v/...`, `/browse/feed`) — immersive
 *   - auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
 *   - landing (`/`)
 *
 * The component is a Client Component so it can read `usePathname()` and
 * apply the active-tab style without a server round-trip on every navigation.
 * Role is passed in as a prop from a Server Component wrapper.
 */

import { Building2, Compass, type Home, Mail, MapPin, Plus, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type ViewerRole = 'anon' | 'buyer' | 'agent';

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Pathname is "active" if it equals href OR starts with href + "/". */
  matchPrefix?: boolean;
};

const COMMON_TABS: Tab[] = [
  { href: '/browse', label: 'Browse', icon: Compass, matchPrefix: false },
  { href: '/nearby', label: 'Nearby', icon: MapPin, matchPrefix: false },
];

const AGENT_EXTRA_TABS: Tab[] = [
  { href: '/dashboard/listings/new', label: 'New', icon: Plus },
  { href: '/dashboard/communities', label: 'Community', icon: Users, matchPrefix: true },
  { href: '/dashboard', label: 'Dashboard', icon: Building2 },
  { href: '/dashboard/leads', label: 'Leads', icon: Mail, matchPrefix: true },
];

const PROFILE_TAB: Tab = { href: '/profile', label: 'Profile', icon: User };

const HIDDEN_PREFIXES = [
  '/v/',
  '/browse/feed',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/',
];

function isHidden(pathname: string): boolean {
  if (pathname === '/') return true;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.matchPrefix === false) {
    return pathname === tab.href;
  }
  if (tab.matchPrefix === true) {
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }
  // Default: exact match (most reliable for tabs that share prefixes,
  // e.g. /dashboard vs /dashboard/listings/new).
  return pathname === tab.href;
}

export function BottomNav({ role }: { role: ViewerRole }) {
  const pathname = usePathname() ?? '/';
  if (isHidden(pathname)) return null;

  const tabs: Tab[] =
    role === 'agent'
      ? [...COMMON_TABS, ...AGENT_EXTRA_TABS, PROFILE_TAB]
      : [...COMMON_TABS, PROFILE_TAB];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-cream/10 border-t bg-ink/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                  active ? 'text-gold' : 'text-cream/65 hover:text-cream'
                }`}
              >
                <Icon size={20} aria-hidden="true" />
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
