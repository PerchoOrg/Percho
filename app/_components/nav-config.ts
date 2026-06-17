/**
 * nav-config — SSOT for primary navigation tabs.
 *
 * Both <BottomNav> (mobile) and <SiteHeader> (desktop md+) consume the same
 * tab definitions so we don't drift across breakpoints. Add or rename a tab
 * once here; both surfaces pick it up.
 *
 * Phase 26 (2026-06-14): introduced when porting mobile-only chrome to desktop.
 * Phase 27 (2026-06-16): drop "Home" tab, promote "Community" to leftmost slot
 * for both buyer and agent. Buyer middle slot is now the emphasized "Explore"
 * FAB-style entry into the swipe feed (consumption, not navigation). Agent
 * left cluster is [Dashboard, Community]; right cluster unchanged.
 */
import {
  Building2,
  Compass,
  Heart,
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
  /**
   * When true, BottomNav renders this tab as the emphasized middle FAB-style
   * slot (raised, gold-tinted, larger icon). Used for the buyer "Explore"
   * tab to mirror the consumption-first IA (Instagram/抖音 center = primary
   * action). Only one tab per role should set this.
   */
  centerEmphasis?: boolean;
};

/**
 * Buyer / anonymous primary tabs. 5 slots, mobile + desktop share the set.
 * Order: Community · Nearby · ▶ Explore (center FAB) · Saved · Me
 *
 * - Community is leftmost: it's the platform's signature asset (12-category
 *   neighborhood video taxonomy lives here). New users land on the grid and
 *   immediately see what makes Vicinity different from Zillow.
 * - Explore in the center is the emphasized swipe-feed entry. This is the
 *   buyer's primary consumption mode — full-screen vertical swipe of all
 *   listings, taste-trained over time.
 * - Nearby and Saved flank Explore as the two filtering/curating verbs.
 * - Me is rightmost (universal convention).
 */
export const BUYER_TABS: Tab[] = [
  { href: '/communities', label: 'Community', icon: Building2, matchPrefix: true },
  { href: '/nearby', label: 'Nearby', icon: MapPin },
  { href: '/browse', label: 'Explore', icon: Compass, matchPrefix: true, centerEmphasis: true },
  { href: '/saved', label: 'Saved', icon: Heart },
  { href: '/profile', label: 'Me', icon: User },
];

/**
 * Agent dashboard tabs. Mobile lays this out as: left=[Dashboard, Community],
 * center=FAB (+New action sheet), right=[Leads, Me]. Desktop renders them
 * as a flat horizontal nav with a "+ New" button on the right cluster.
 *
 * Phase 27: dropped "Home" (agents don't browse listings as a primary verb)
 * and added "Community" so the agent's content-management hub is one tap away.
 */
export const AGENT_LEFT_TABS: Tab[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/dashboard/communities',
    label: 'Community',
    icon: Building2,
    matchPrefix: true,
  },
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
