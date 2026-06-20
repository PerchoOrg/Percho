/**
 * nav-config — SSOT for primary navigation tabs.
 *
 * Both <BottomNav> (mobile) and <SiteHeader> (desktop md+) consume the same
 * tab definitions so we don't drift across breakpoints. Add or rename a tab
 * once here; both surfaces pick it up.
 *
 * Phase 26 (2026-06-14): introduced when porting mobile-only chrome to desktop.
 * Phase 27 (2026-06-16): drop "Home" tab, promote "Community" to leftmost slot.
 *   Buyer middle slot was the emphasized "Explore" FAB-style entry into the
 *   swipe feed (consumption, not navigation).
 * Phase 36 (2026-06-18): unified IA. One nav for all roles — agents and buyers
 *   share the same 5-slot bar with Explore as the center FAB.
 * Phase 37 (2026-06-18): collapse "Nearby" tab into Explore as a sub-tab,
 *   drop the center FAB. Bottom nav is now a flat 4-icon bar:
 *     Community · Explore · {Saved|Workspace} · Me
 *   Rationale: /nearby is a *filter* on the same listings catalog, not a
 *   distinct verb. Two top-level slots ("Explore" + "Nearby") both leading
 *   to listings was redundant — Tianrou caught it 2026-06-18: "nearby
 *   占地下 bottom nav 一个位置有必要吗". The Recommended/Nearby split now
 *   lives as sub-nav inside /browse (Douyin-style: 推荐/同城). Both sub-tabs
 *   are grids that click through into the same swipe feed — consumption
 *   shape is preserved.
 *
 *   The center FAB visual emphasis is also removed: with 4 slots a flat bar
 *   reads as "all equal-weight verbs" which is closer to the new IA. The
 *   swipe-feed-as-primary signal moves to the Explore page itself (cards
 *   click straight into vertical feed) rather than the nav.
 */
import {
  Briefcase,
  Building2,
  Compass,
  Heart,
  LogIn,
  type LucideIcon,
  Plus,
  User,
} from 'lucide-react';

export type ViewerRole = 'anon' | 'buyer' | 'agent';

export type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathname is "active" if it equals href OR starts with `${href}/`. */
  matchPrefix?: boolean;
  /** When true, this slot renders as a center FAB instead of a regular tab. */
  fab?: boolean;
};

/**
 * Build the role's primary tabs.
 *
 * - anon:  For You · Community · Favorites · Sign in
 * - buyer: For You · Community · Favorites · Me
 * - agent: Agent Hub · For You · +(FAB) · Community · Me  (5 slots, center FAB
 *   opens the upload action sheet — see UploadFAB)
 */
export function getPrimaryTabs(role: ViewerRole): Tab[] {
  if (role === 'agent') {
    return [
      { href: '/dashboard', label: 'Agent Hub', icon: Briefcase, matchPrefix: true },
      { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
      { href: '/upload', label: 'Upload', icon: Plus, fab: true },
      { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
      { href: '/profile', label: 'Me', icon: User },
    ];
  }

  const slot4: Tab =
    role === 'buyer'
      ? { href: '/profile', label: 'Me', icon: User }
      : { href: '/login', label: 'Sign in', icon: LogIn };

  return [
    { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
    { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
    { href: '/saved', label: 'Favorites', icon: Heart },
    slot4,
  ];
}

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

// Community swipe feed: /c/<slug>/feed — immersive vertical video, hide chrome.
const COMMUNITY_FEED_RE = /^\/c\/[^/]+\/feed(?:\/|$)/;

export function isChromeHidden(pathname: string): boolean {
  if (pathname === '/') return true;
  if (COMMUNITY_FEED_RE.test(pathname)) return true;
  return CHROME_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function isTabActive(pathname: string, tab: Tab): boolean {
  if (tab.matchPrefix === true) {
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }
  return pathname === tab.href;
}
