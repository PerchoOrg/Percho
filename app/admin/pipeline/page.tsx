/**
 * /admin/pipeline — landing card grid. Same nav shortcuts as the sidebar,
 * but with counts so an admin can see at a glance where work is queued.
 */

import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getCounts() {
  const supabase = createServiceClient();

  const [listingsMissing, communitiesActive, bucketPending, bucketFailed, tourPending] = await Promise.all([
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .is('community_id', null)
      .neq('status', 'archived'),
    supabase.from('communities').select('id', { count: 'exact', head: true }),
    supabase
      .from('generated_videos')
      .select('id', { count: 'exact', head: true })
      .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
      .eq('status', 'pending'),
    supabase
      .from('generated_videos')
      .select('id', { count: 'exact', head: true })
      .in('scope', ['listing_intent_bucket', 'community_intent_bucket'])
      .eq('status', 'failed'),
    supabase
      .from('listing_videos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing'),
  ]);

  return {
    listingsMissing: listingsMissing.count ?? 0,
    communitiesActive: communitiesActive.count ?? 0,
    bucketPending: bucketPending.count ?? 0,
    bucketFailed: bucketFailed.count ?? 0,
    tourPending: tourPending.count ?? 0,
  };
}

type Card = {
  href: string;
  title: string;
  description: string;
  countKey?: keyof Awaited<ReturnType<typeof getCounts>>;
  countLabel?: string;
  warnKey?: keyof Awaited<ReturnType<typeof getCounts>>;
  warnLabel?: string;
};

const CARDS: Card[] = [
  {
    href: '/admin/pipeline/listing-nearby',
    title: 'Listing Nearby',
    description:
      'Per-listing POI discovery, photo triage, and bucket-video generation. Use this for listings without a covering community.',
    countKey: 'listingsMissing' as const,
    countLabel: 'listings with no community',
  },
  {
    href: '/admin/pipeline/community-nearby',
    title: 'Community Nearby',
    description:
      'Per-community POI discovery + video generation. Shared across every listing in the community.',
    countKey: 'communitiesActive' as const,
    countLabel: 'communities',
  },
  {
    href: '/admin/pipeline/bucket-jobs',
    title: 'Bucket Video Jobs',
    description:
      'Cross-listing / cross-community queue for `generated_videos` (nearby bucket renders).',
    countKey: 'bucketPending' as const,
    countLabel: 'pending',
    warnKey: 'bucketFailed' as const,
    warnLabel: 'failed',
  },
  {
    href: '/admin/pipeline/tour-jobs',
    title: 'Tour Video Jobs',
    description: 'LISTING archetype (`listing_videos`) render queue.',
    countKey: 'tourPending' as const,
    countLabel: 'processing',
  },
  {
    href: '/admin/pipeline/poi-library',
    title: 'POI Library',
    description: 'Global `pois` + `poi_photos` audit. Inspect what the AI tagger produced.',
  },
  {
    href: '/admin/pipeline/worker-health',
    title: 'Worker Health',
    description: 'Render-worker heartbeat, backlog counts, recent failures.',
  },
];

export default async function PipelineHubPage() {
  const counts = await getCounts();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-ink2 mt-1 text-sm">
          Automated photo &amp; video pipeline for the platform. Nearby POI discovery, AI photo
          tagging, bucket video generation, and tour rendering all live here.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const count = c.countKey ? counts[c.countKey] : null;
          const warn = c.warnKey ? counts[c.warnKey] : null;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-2xl border border-line bg-surface p-5 transition hover:border-ink2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{c.title}</h2>
                {count !== null && (
                  <span className="text-ink2 text-xs">
                    <span className="text-ink text-lg font-semibold">{count}</span>{' '}
                    {c.countLabel}
                  </span>
                )}
              </div>
              <p className="text-ink2 mt-2 text-sm">{c.description}</p>
              {warn !== null && warn > 0 && (
                <p className="mt-2 text-xs font-medium text-red-500">
                  ⚠ {warn} {c.warnLabel}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
