/**
 * nav-config — SSOT for primary navigation + sub-tabs.
 *
 * Both <BottomNav> (mobile bottom bar) and <DesktopSidebar> (md+ left rail) +
 * <TopBar> (mobile + desktop top bar with sub-tabs) consume the same tab
 * definitions so chrome can't drift across breakpoints. Add or rename a tab
 * once here; every surface picks it up.
 *
 * Phase 26 (2026-06-14): introduced when porting mobile-only chrome to desktop.
 * Phase 27 (2026-06-16): drop "Home" tab, promote "Community" to leftmost slot.
 * Phase 36 (2026-06-18): unified IA. One nav for all roles — agents and buyers
 *   share the same 5-slot bar with Explore as the center FAB.
 * Phase 37 (2026-06-18): collapse "Nearby" tab into Explore as a sub-tab,
 *   drop the center FAB. Bottom nav is now a flat 4-icon bar.
 * Phase 43.7 (2026-06-20): drop the Recommended/Nearby split inside /browse.
 * Phase 45 (2026-06-20): ground-up nav redesign — left vertical sidebar on
 *   desktop (Xiaohongshu/Linear shape), top bar with [search · sub-tabs · avatar]
 *   on every breakpoint. `getSubTabs(pathname, role)` is the new SSOT for the
 *   contextual second-level nav (Explore/Nearby on /browse + /communities,
 *   Listings/Communities/Leads/Analytics on /dashboard, single label fallback
 *   on /saved + /profile).
 *
 *   Agent's mobile bottom nav still uses the 5-slot bar with center + New FAB,
 *   but the desktop sidebar promotes "+ New" to a real primary tab with a
 *   dropdown — the bottom-nav center FAB and the sidebar "+ New" tab open the
 *   same Listing/Community picker. + New is inserted *between* Community and
 *   Profile so the sidebar order mirrors the mobile bar's center-emphasis slot.
 */
import {
  Briefcase,
  Building2,
  Compass,
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
  /** When true, this slot renders as a center FAB in BottomNav and as a
   *  dropdown trigger in DesktopSidebar (not a normal Link). */
  fab?: boolean;
};

/**
 * Build the role's primary tabs.
 *
 * - anon:  For You · Community · Me (links /login)
 * - buyer: For You · Community · Me
 * - agent: Agent Hub · For You · Community · + New · Me  (#13 — see DesktopSidebar)
 *
 * Phase 45.9: dropped Favorites from primary tabs per owner 2026-06-20.
 *   (BottomNav still renders + New as a center FAB; DesktopSidebar renders it
 *   as a dropdown. Phase 45.)
 */
export function getPrimaryTabs(role: ViewerRole): Tab[] {
  if (role === 'agent') {
    return [
      { href: '/dashboard', label: 'Agent Hub', icon: Briefcase, matchPrefix: true },
      { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
      { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
      { href: '/upload', label: '+ New', icon: Plus, fab: true },
      { href: '/profile', label: 'Me', icon: User },
    ];
  }

  // Anon's Me tab links to /login (auth gate). Buyer's Me goes to /profile.
  // Favorites is intentionally NOT in primary tabs anymore — owner moved it
  // off the top nav 2026-06-20 since SavedClient is reachable from Me/avatar
  // menu and the empty-state CTAs already cover discovery.
  const meTab: Tab =
    role === 'buyer'
      ? { href: '/profile', label: 'Me', icon: User }
      : { href: '/login', label: 'Me', icon: User };

  return [
    { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
    { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
    meTab,
  ];
}

/**
 * Sub-tab — second-level horizontal nav rendered in the TopBar middle slot.
 * `href` is the route the tab links to. Active = pathname equals or starts
 * with href (sub-routes inherit parent's active state).
 */
export type SubTab = {
  href: string;
  label: string;
};

/**
 * Resolve sub-tabs for the current pathname.
 *
 * Returns null when the route has no contextual sub-nav (TopBar middle slot
 * stays empty on /saved + /profile per owner's call 2026-06-20).
 *
 * Routes:
 *   /browse, /browse/*           → Explore | Nearby
 *   /communities, /communities/* → Explore | Nearby
 *   /saved                       → "Favorites" (single non-clickable label)
 *   /profile                     → "Profile"  (single non-clickable label)
 *   /dashboard*                  → Listings | Communities | Leads | Analytics
 *
 * Agent dashboard sub-routes that don't fit one of the four buckets (e.g.
 * /dashboard/listings/[id]/edit) inherit the closest match — `Listings` for
 * anything under /dashboard/listings, `Communities` for /dashboard/communities,
 * etc. The default branch falls back to `Listings` for plain /dashboard.
 */
export function getSubTabs(pathname: string, role: ViewerRole): SubTab[] | null {
  if (pathname === '/browse' || pathname.startsWith('/browse/')) {
    // The swipe feed is its own immersive surface — chrome hides there entirely
    // (handled by isChromeHidden). Sub-tabs only matter for grid views.
    return [
      { href: '/browse', label: 'Explore' },
      { href: '/browse/nearby', label: 'Nearby' },
    ];
  }
  if (pathname === '/communities' || pathname.startsWith('/communities/')) {
    return [
      { href: '/communities', label: 'Explore' },
      { href: '/communities/nearby', label: 'Nearby' },
    ];
  }
  if (pathname === '/saved' || pathname.startsWith('/saved/')) {
    // /saved sub-tabs are owned by SavedClient itself (Listings | Communities
    // pill row). TopBar middle stays empty here — no redundant label.
    return null;
  }
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return null;
  }
  if (role === 'agent' && (pathname === '/dashboard' || pathname.startsWith('/dashboard'))) {
    return [
      { href: '/dashboard', label: 'Listings' },
      { href: '/dashboard/communities', label: 'Communities' },
      { href: '/dashboard/leads', label: 'Leads' },
      { href: '/dashboard/analytics', label: 'Analytics' },
    ];
  }
  return null;
}

/**
 * Active rule for sub-tabs — same prefix-or-equal rule the primary tabs use,
 * but `/dashboard` (Listings) needs special handling so it doesn't swallow
 * /dashboard/communities, /dashboard/leads, /dashboard/analytics.
 */
export function isSubTabActive(pathname: string, sub: SubTab, all: SubTab[]): boolean {
  // Longest-prefix-wins: a sub-tab is active iff it has the longest matching
  // prefix among siblings. Resolves the /dashboard ⊃ /dashboard/communities
  // ambiguity without per-tab special cases.
  const matches = all.filter(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  if (matches.length === 0) {
    // Fall back to the first sub-tab on bare /dashboard, /browse, etc. that
    // don't match any sub-tab href exactly. (Defensive; usually unreachable
    // because the first tab's href equals the bare route.)
    return sub.href === all[0]?.href;
  }
  const best = matches.reduce((a, b) => (a.href.length >= b.href.length ? a : b));
  return sub.href === best.href;
}

/**
 * Routes where chrome (BottomNav + DesktopSidebar + TopBar) hides itself
 * entirely: the swipe feed, auth screens, and the landing hero.
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
