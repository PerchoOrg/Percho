import type { ReactNode } from 'react';

import { MobileBottomNav } from '@/components/reelestate/MobileBottomNav';

/**
 * Mobile route-group shell for the ReelEstate UI rewrite.
 * ref: docs/design/reelestate-teardown/README.md §0 (dark near-black bg) + §1 (tokens).
 *
 * Provides:
 *   - Near-black page background (`bg-bg`, token from README §1)
 *   - Safe-area insets for iOS notch + home indicator
 *   - <MobileBottomNav> 4-slot placeholder (Z7.1). Feed slot links to /feed;
 *     Explore / Messages / Profile stay inert until those routes ship (final
 *     4/5-slot selection is Off-limits §7).
 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-bg text-white/90 [padding-top:env(safe-area-inset-top)]">
      <div className="pb-[calc(64px+env(safe-area-inset-bottom))]">{children}</div>
      <MobileBottomNav />
    </div>
  );
}
