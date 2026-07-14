import type { ReactNode } from 'react';

/**
 * Mobile route-group shell for the ReelEstate UI rewrite.
 * ref: docs/design/reelestate-teardown/README.md §0 (dark near-black bg) + §1 (tokens).
 *
 * Provides:
 *   - Near-black page background (`bg-bg`, token from README §1)
 *   - Safe-area insets for iOS notch + home indicator
 *   - No-op bottom nav placeholder — final 4/5-slot selection deferred to Z7.1
 *     (see docs/design/reelestate-teardown/.cron-plan.md → Off-limits §7)
 *
 * The root layout (`app/layout.tsx`) still renders legacy Aman chrome; each
 * (mobile) page that ships will add its route to `isChromeHidden` so those
 * chromes hide on that path. Nothing to hide yet — no pages under (mobile).
 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-bg text-white/90 [padding-top:env(safe-area-inset-top)]">
      <div className="pb-[calc(64px+env(safe-area-inset-bottom))]">{children}</div>
      <nav
        aria-label="Mobile primary navigation (placeholder)"
        className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t border-bg-border bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        {(['Feed', 'Explore', 'Messages', 'Profile'] as const).map((label) => (
          <span
            key={label}
            className="text-[11px] font-semibold uppercase tracking-chip text-white/40"
          >
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}
