import Link from 'next/link';
import type { ReactNode } from 'react';

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="border-b border-line bg-amber-50 px-4 py-2 text-center text-xs text-ink2 print:hidden">
        internal — unlisted
      </div>
      <nav className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/internal/meetup" className="font-medium hover:underline">
            ← All docs
          </Link>
          <Link href="/agents" className="text-ink2 hover:underline">
            Landing page /agents
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
