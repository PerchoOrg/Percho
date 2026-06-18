/**
 * nav-config — SSOT for primary navigation tabs.
 *
 * Both <BottomNav> (mobile) and <SiteHeader> (desktop md+) consume the same
 * tab definitions so we don't drift across breakpoints. Add or rename a tab
 * once here; both surfaces pick it up.
 *
 * Phase 26 (2026-06-14): introduced when porting mobile-only chrome to desktop.
 * Phase 27 (2026-06-16): drop "Home" tab, promote "Community" to leftmost slot.
 *   Buyer middle slot is the emphasized "Explore" FAB-style entry into the
 *   swipe feed (consumption, not navigation).
 * Phase 36 (2026-06-18): unified IA. One nav for all roles — agents and buyers
 *   share the same 5-slot bar with Explore as the center FAB. The only role
 *   difference is slot 4: buyers see "Saved", agents see "Leads". Dashboard,
 *   Listings management, and the "+ New" listing flow live inside the agent's
 *   profile (`/profile`) — they're agent-specific affordances, not primary
 *   verbs. The "Preview as buyer" mode is gone: agents already use the buyer
 *   surface as their default.
 *
 *   Rationale: agents spend 80% of their time doing buyer-shaped work
 *   (browsing market, comps, competitor listings). A separate agent IA forced
 *   a "preview mode" toggle to compensate, which is itself a smell. Airbnb /
 *   Instagram model: one consumption surface, role-specific tools live in the
 *   profile drawer.
 */
import { Briefcase, Building2, Compass, Heart, type LucideIcon, MapPin, User } from 'lucide-react';

export type ViewerRole = 'anon' | 'buyer' | 'agent';

export type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathname is "active" if it equals href OR starts with `${href}/`. */
  matchPrefix?: boolean;
  /**
   * When true, BottomNav renders this tab as the emphasized middle FAB-style
   * slot (raised, gold-tinted, larger icon). Used for the "Explore" tab to
   * mirror the consumption-first IA (Instagram/抖音 center = primary action).
   * Only one tab per role should set this.
   */
  centerEmphasis?: boolean;
};

/**
 * Build the role's primary tabs. 5 slots, mobile + desktop share the set.
 *
 * Order: Community · Nearby · ▶ Explore (center FAB) · {Saved|Leads} · Me
 *
 * - Community is leftmost: it's the platform's signature asset (12-category
 *   neighborhood video taxonomy lives here).
 * - Nearby is the buyer's location-anchored discovery verb.
 * - Explore in the center is the emphasized swipe-feed entry. Primary
 *   consumption mode for both roles.
 * - Slot 4 swaps by role: buyers save listings, agents work leads. These are
 *   the equivalent "what you keep coming back to" verbs for each role.
 * - Me is rightmost (universal convention). Agents reach Dashboard /
 *   Listings management / + New listing through `/profile` shortcuts.
 */
export function getPrimaryTabs(role: ViewerRole): Tab[] {
  // Phase 36.1 (2026-06-18): agent slot 4 was "Leads" → "/dashboard/leads",
  // but that surface is already a *subset* of /dashboard (which has leads +
  // listings management + community-video upload). Two entry points to
  // overlapping content (bottom-nav "Leads" and Me-tab "Open dashboard")
  // confused users — Tianrou caught it 2026-06-18: "dashboard 里的 lead 和
  // bottom nav 里的 lead 完全是重复的". Renaming "Leads" → "Workspace" + pointing
  // it at /dashboard collapses both entries into one. The "Open dashboard"
  // shortcut on /profile is removed in the same change so there is one
  // canonical entry to the agent's working surface.
  //
  // Why "Workspace" and not "Dashboard": dashboards are read-only data
  // overviews; this surface is action-shaped (manage listings, upload videos,
  // work leads). Workspace = where you do the work.
  const slot4: Tab =
    role === 'agent'
      ? { href: '/dashboard', label: 'Workspace', icon: Briefcase, matchPrefix: true }
      : { href: '/saved', label: 'Saved', icon: Heart };

  return [
    { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
    { href: '/nearby', label: 'Nearby', icon: MapPin },
    { href: '/browse', label: 'Explore', icon: Compass, matchPrefix: true, centerEmphasis: true },
    slot4,
    { href: '/profile', label: 'Me', icon: User },
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
