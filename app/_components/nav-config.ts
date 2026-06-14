/**
 * nav-config — SSOT for primary navigation tabs.
 *
 * Both <BottomNav> (mobile) and <SiteHeader> (desktop md+) consume the same
 * tab definitions so we don't drift across breakpoints. Add or rename a tab
 * once here; both surfaces pick it up.
 *
 * Phase 26 (2026-06-14): introduced when porting mobile-only chrome to desktop.
 */
import {
  Compass,
  Heart,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MapPin,
  User,
} from 'lucide-react';

export type ViewerRole = 'anon' | 'buyer' | 'agent';

export type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathname is "active" if it equals href OR starts with `${href}/`. */
  matchPrefix?: boolean;
};

/**
 * Buyer / anonymous primary tabs. Same set on both mobile and desktop.
 * Mobile renders all 5 in the bottom nav. Desktop drops "Me" on the left
 * cluster (it lives in the right-side avatar dropdown) and shows the rest
 * inline as header links.
 */
export const BUYER_TABS: Tab[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/browse', label: 'Explore', icon: Compass },
  { href: '/saved', label: 'Saved', icon: Heart },
  { href: '/nearby', label: 'Nearby', icon: MapPin },
  { href: '/profile', label: 'Me', icon: User },
];

/**
 * Agent dashboard tabs. Mobile lays this out as: left=[Home, Dashboard],
 * center=FAB (+New action sheet), right=[Leads, Me]. Desktop renders them
 * as a flat horizontal nav with a "+ New" button on the right cluster.
 */
export const AGENT_LEFT_TABS: Tab[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export const AGENT_RIGHT_TABS: Tab[] = [
  { href: '/dashboard/leads', label: 'Leads', icon: Mail, matchPrefix: true },
  { href: '/profile', label: 'Me', icon: User },
];

/**
 * Routes where chrome (BottomNav + SiteHeader) hides itself entirely:
 * the swipe feed, auth screens, and the landing hero.
 */
export const CHROME_HIDDEN_PREFIXES = [
  '/v/',
  '/browse/feed',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/',
];

export function isChromeHidden(pathname: string): boolean {
  if (pathname === '/') return true;
  return CHROME_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function isTabActive(pathname: string, tab: Tab): boolean {
  if (tab.matchPrefix === true) {
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }
  return pathname === tab.href;
}
