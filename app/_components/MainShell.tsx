'use client';

/**
 * MainShell — wraps <main> content so the md:pl-[200px] inset only applies
 * when the DesktopSidebar is actually rendered (i.e. chrome is not hidden).
 *
 * Phase 45.9 (2026-06-20): owner reported a white blank strip on the desktop
 * landing page. Root cause — layout.tsx unconditionally added md:pl-[200px]
 * to <main>, but DesktopSidebar self-hides on landing/feed/auth via
 * isChromeHidden, so the inset reserved 200px for nothing. Pull the padding
 * decision into a client shell that reads the same isChromeHidden rule.
 */

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isChromeHidden } from './nav-config';

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const hidden = isChromeHidden(pathname);
  return <main className={hidden ? '' : 'md:pl-[200px]'}>{children}</main>;
}
