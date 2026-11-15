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
 *
 * 2026-11-14: the Home Nearby tab was dropped (owner: "delete Home Nearby tab
 * if it is not used anymore") — listings are off on web and iOS. The pages
 * under /admin/pipeline/listing-nearby still work and Video Jobs rows still
 * link to them. A City Tour tab was added (phase318).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { Activity, Building2, Film, Landmark, ListVideo, MessageSquare, Music } from 'lucide-react';
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
    id: 'city-tours',
    label: 'City Tour',
    href: '/admin/pipeline/city-tours',
    icon: <Landmark size={22} />,
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
    id: 'reviews',
    label: 'Reviews',
    href: '/admin/pipeline/reviews',
    icon: <MessageSquare size={22} />,
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
      {/* max-w-screen-2xl, not 6xl. Every page under /admin is a wide data
          table, and 6xl (1152px) is a reading measure — it forced the photo
          table's ~15 columns into a horizontal scroll, which is where the Clip
          columns went (owner 2026-08-19: "make this a big table to show all
          columns in one page"). */}
      <main className="mx-auto max-w-screen-2xl px-3 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
