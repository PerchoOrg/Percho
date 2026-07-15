/**
 * nav-config — SSOT for primary navigation + sub-tabs.
 *
 * Both <BottomNav> (mobile bottom bar) and <DesktopSidebar> (md+ left rail) +
 * <TopBar> (mobile + desktop top bar with sub-tabs) consume the same tab
 * definitions so chrome can't drift across breakpoints. Add or rename a tab
 * once here; every surface picks it up.
 *
 * Phase 45.11 (2026-06-20): owner round 3 —
 *   - Favorites: stays primary for buyer/anon, dropped from agent primary
 *     (agents reach saves via the avatar menu under Me).
 *   - /saved sub-tabs: Listings | Communities now live in the global TopBar
 *     middle slot (was an internal pill row inside SavedClient).
 *   - Agent "+ New" label loses the leading "+" (icon already shows the plus).
 *   - /dashboard sub-tabs renamed singular: Listing / Community.
 */
import {
  Bookmark,
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
 * - anon:  For You · Community · Favorites · Me
 * - buyer: For You · Community · Favorites · Me
 * - agent: Agent Hub · For You · Community · New · Me
 *          (Favorites is reachable from the avatar menu, not a primary tab)
 */
export function getPrimaryTabs(role: ViewerRole): Tab[] {
  if (role === 'agent') {
    // Phase 45.12 (2026-06-20): "+ New" moved to the center slot so the
    // mobile FAB lands in the middle of the 5-item BottomNav (index 2 of 5)
    // per owner — matches the visual idiom of TikTok / Instagram bottom nav.
    return [
      { href: '/dashboard', label: 'Agent Hub', icon: Briefcase, matchPrefix: true },
      { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
      { href: '/upload', label: 'New', icon: Plus, fab: true },
      { href: '/communities', label: 'Neighborhood', icon: Building2, matchPrefix: true },
      { href: '/profile', label: 'Me', icon: User },
    ];
  }

  return [
    { href: '/browse', label: 'For You', icon: Compass, matchPrefix: true },
    { href: '/communities', label: 'Neighborhood', icon: Building2, matchPrefix: true },
    { href: '/saved', label: 'Favorites', icon: Bookmark },
    { href: '/profile', label: 'Me', icon: User },
  ];
}

/**
 * Sub-tab — second-level horizontal nav rendered in the TopBar middle slot.
 */
export type SubTab = {
  href: string;
  label: string;
};

/**
 * Resolve sub-tabs for the current pathname.
 */
export function getSubTabs(pathname: string, role: ViewerRole): SubTab[] | null {
  // Phase 66 (2026-07-02): Nearby sub-tabs removed per owner (笑云 feedback,
  // "reduce frictions"). /browse and /communities used to render
  // [Explore, Nearby]; now they render nothing here — TopBar centres a
  // static "Explore" title in the middle slot instead. The /browse/nearby
  // and /communities/nearby routes are still live but no longer navigable
  // from the chrome.
  if (pathname === '/saved' || pathname.startsWith('/saved/')) {
    // Phase 45.11: Listing / Community are now the global TopBar sub-tabs
    // for Favorites. SavedClient no longer renders its own pill row.
    // Phase 45.12 (2026-06-20): singular per owner ("Listing" / "Community").
    // Phase 66 (2026-07-02): community → neighborhood UI rename.
    return [
      { href: '/saved', label: 'Saved Listing' },
      { href: '/saved/communities', label: 'Saved Neighborhood' },
    ];
  }
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return null;
  }
  if (role === 'agent' && (pathname === '/dashboard' || pathname.startsWith('/dashboard'))) {
    // Phase 45.12 (2026-06-20): "My …" prefix per owner so agents read the
    // tabs as their own inventory, not a generic catalog.
    // Phase 66 (2026-07-02): Analytics moved to /profile per owner
    // (笑云 feedback). community → neighborhood UI rename.
    return [
      { href: '/dashboard', label: 'My Listing' },
      { href: '/dashboard/communities', label: 'My Neighborhood' },
      { href: '/dashboard/leads', label: 'My Leads' },
    ];
  }
  return null;
}

/**
 * Active rule for sub-tabs — longest-prefix-wins so /dashboard doesn't
 * swallow /dashboard/communities, /dashboard/leads, /dashboard/analytics.
 */
export function isSubTabActive(pathname: string, sub: SubTab, all: SubTab[]): boolean {
  const matches = all.filter(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  if (matches.length === 0) {
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
