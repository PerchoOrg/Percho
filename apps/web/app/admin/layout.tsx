/**
 * /admin layout — HubTabs chip bar identical to the agent hub, mobile
 * ↔ desktop. Every child route is admin-gated at this layer.
 *
 * sidebar retired in favor of a chip-mode tab bar.
 *
 * 2026-08-03: six tabs. The POI tab was dropped (owner) — every POI photo is
 * now reachable through the Community Tour / Home Nearby photo tables, which
 * show the same `poi_photos` rows in context. `/admin/pipeline/poi-library`
 * still WORKS and is still linked from those tables' rows; it just isn't a
 * top-level destination.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { Activity, Building2, Film, Home, ListVideo, Music } from 'lucide-react';
import { redirect } from 'next/navigation';
import { type AdminHubTab, AdminHubTabs } from './_components/AdminHubTabs';

const TABS: AdminHubTab[] = [
  { id: 'tour', label: 'Home Tour', href: '/admin/pipeline/tour-jobs', icon: <Film size={22} /> },
  {
    id: 'community-nearby',
    label: 'Community Tour',
    href: '/admin/pipeline/community-nearby',
    icon: <Building2 size={22} />,
  },
  {
    id: 'listing-nearby',
    label: 'Home Nearby',
    href: '/admin/pipeline/listing-nearby',
    icon: <Home size={22} />,
  },
  {
    id: 'jobs',
    label: 'Video Jobs',
    href: '/admin/pipeline/bucket-jobs',
    icon: <ListVideo size={22} />,
  },
  {
    id: 'bgm',
    label: 'Music',
    href: '/admin/pipeline/bgm',
    icon: <Music size={22} />,
  },
  {
    id: 'health',
    label: 'Worker',
    href: '/admin/pipeline/worker-health',
    icon: <Activity size={22} />,
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-bg text-ink">
      <AdminHubTabs tabs={TABS} />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
