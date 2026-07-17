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
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold uppercase tracking-wide">Admin</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-4 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block shrink-0 rounded-lg border border-transparent px-3 py-2 hover:border-line hover:bg-surface lg:shrink"
              >
                <div className="whitespace-nowrap text-sm font-medium lg:whitespace-normal">
                  {item.label}
                </div>
                <div className="text-ink2 hidden text-xs lg:block">{item.blurb}</div>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
