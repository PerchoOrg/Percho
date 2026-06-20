'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isChromeHidden } from './nav-config';

export function SearchPill() {
  const pathname = usePathname() ?? '/';
  if (isChromeHidden(pathname)) return null;
  return (
    <div
      className="fixed top-3 z-30 md:hidden"
      style={{ right: 'calc(0.75rem + 44px + 8px)', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <Link
        href="/search"
        aria-label="Search"
        className="flex h-11 w-11 items-center justify-center rounded-full border-line border bg-bg text-ink2 backdrop-blur-md transition hover:text-ink"
      >
        <Search size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}
