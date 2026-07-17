/**
 * /admin layout — thin chrome with a left nav for platform-ops sections.
 *
 * Every child route is gated: if the visitor isn't an admin the layout
 * itself redirects to /dashboard. Individual pages don't need to re-check.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';

const NAV: Array<{ href: string; label: string; blurb: string }> = [
  {
    href: '/admin/pipeline',
    label: 'Pipeline',
    blurb: 'Overview',
  },
  {
    href: '/admin/pipeline/listing-nearby',
    label: 'Listing Nearby',
    blurb: 'Per-listing POI + bucket videos',
  },
  {
    href: '/admin/pipeline/community-nearby',
    label: 'Community Nearby',
    blurb: 'Per-community POI + bucket videos',
  },
  {
    href: '/admin/pipeline/bucket-jobs',
    label: 'Bucket Jobs',
    blurb: 'generated_videos queue (nearby)',
  },
  {
    href: '/admin/pipeline/tour-jobs',
    label: 'Tour Jobs',
    blurb: 'listing_videos render queue',
  },
  {
    href: '/admin/pipeline/poi-library',
    label: 'POI Library',
    blurb: 'Global pois + poi_photos audit',
  },
  {
    href: '/admin/pipeline/worker-health',
    label: 'Worker Health',
    blurb: 'render-worker heartbeat + counts',
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-ink2 text-sm hover:text-ink">
              ← Dashboard
            </Link>
            <span className="text-ink2">/</span>
            <span className="text-sm font-semibold uppercase tracking-wide">Admin</span>
          </div>
          <div className="text-ink2 text-xs">
            {admin.name} <span className="opacity-60">({admin.email})</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <aside className="w-56 shrink-0">
          <nav className="sticky top-4 space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg border border-transparent px-3 py-2 hover:border-line hover:bg-surface"
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-ink2 text-xs">{item.blurb}</div>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
