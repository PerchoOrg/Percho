'use client';

/**
 * MobileBottomNav — 4-slot bottom nav placeholder for the ReelEstate mobile
 * canvas.
 *
 * ref: docs/design/reelestate-teardown/.cron-plan.md → Z7.1
 *      + Off-limits §7 ("Bottom nav 5-slot final selection" deferred)
 *
 * Behavior:
 *  - Slots: Feed · Explore · Messages · Profile (icons + labels, lucide).
 *  - Active slot highlights via `usePathname()` prefix match against `href`.
 *  - `Feed` links to the real `/feed` route that already ships.
 *  - `Explore` / `Messages` / `Profile` are inert `<span>`s until their
 *    screens land (Messages is blocked by the schema gap logged in M5.1/M5.3;
 *    Explore + Profile are not yet built). Rendering them as dead links would
 *    404 in dev and mislead reviewers, so we keep them non-interactive with
 *    `aria-disabled` and the same visual footprint as the active slot for
 *    layout parity.
 *  - No data, no state, no mock — pure chrome.
 */
import { Compass, Home, MessageCircle, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Slot = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When false, renders as an inert span (route not yet built). */
  live: boolean;
};

const SLOTS: readonly Slot[] = [
  { href: '/feed', label: 'Feed', icon: Home, live: true },
  { href: '/explore', label: 'Explore', icon: Compass, live: false },
  { href: '/messages', label: 'Messages', icon: MessageCircle, live: false },
  { href: '/profile', label: 'Profile', icon: User, live: false },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around border-t border-bg-border bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      {SLOTS.map((slot) => {
        const active = isActive(pathname, slot.href);
        const Icon = slot.icon;
        const tone = active ? 'text-cyan-300' : 'text-white/50';
        const iconWrap = active
          ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.55)]'
          : 'text-white/60';
        const inner = (
          <span
            className={`flex h-full w-full flex-col items-center justify-center gap-0.5 ${tone}`}
          >
            <Icon className={`h-5 w-5 ${iconWrap}`} strokeWidth={active ? 2.2 : 1.75} />
            <span className="text-[10px] font-semibold uppercase tracking-chip">
              {slot.label}
            </span>
          </span>
        );

        if (!slot.live) {
          return (
            <span
              key={slot.href}
              aria-disabled="true"
              className="flex-1 cursor-not-allowed opacity-70"
            >
              {inner}
            </span>
          );
        }

        return (
          <Link
            key={slot.href}
            href={slot.href}
            aria-current={active ? 'page' : undefined}
            className="flex-1"
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
