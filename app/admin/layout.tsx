/**
 * /admin layout — HubTabs chip bar identical to the agent hub, mobile
 * ↔ desktop. Every child route is admin-gated at this layer.
 *
 * sidebar retired in favor of a chip-mode tab
 * bar.
 * split Nearby into Home + Neighborhood.
 * Seven tabs now — the chip strip scrolls horizontally on narrow
 * viewports.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { Activity, Building2, Film, Home, ImageIcon, ListVideo, Music } from 'lucide-react';
import { redirect } from 'next/navigation';
import { type AdminHubTab, AdminHubTabs } from './_components/AdminHubTabs';

const TABS: AdminHubTab[] = [
  { id: 'tour', label: 'Home Tour', href: '/admin/pipeline/tour-jobs', icon: <Film size={22} /> },
  {
    id: 'listing-nearby',
    label: 'Listing Nearby',
    href: '/admin/pipeline/listing-nearby',
    icon: <Home size={22} />,
  },
  {
    id: 'community-nearby',
    label: 'Neighborhood Nearby',
    href: '/admin/pipeline/community-nearby',
    icon: <Building2 size={22} />,
  },
  { id: 'poi', label: 'POI', href: '/admin/pipeline/poi-library', icon: <ImageIcon size={22} /> },
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
