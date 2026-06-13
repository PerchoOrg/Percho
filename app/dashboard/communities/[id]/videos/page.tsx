/**
 * /dashboard/communities/[id]/videos — community video upload page (Phase 17).
 *
 * Phase 17 split: video upload moved off the (long) editor page so the agent's
 * focused task — drop a video in — fits a single screen. Only loads what the
 * uploader needs: the community itself + its schools/POIs (for the optional
 * "link to" dropdowns) + existing community videos for the polled status list.
 *
 * Anyone authenticated can upload (community videos remain globally writable
 * by V1 design; only metadata is creator-gated — see migration 0013).
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityVideoPanel, type CommunityVideoRow } from '../CommunityVideoPanel';
import type { PoiRow, SchoolRow } from '../page';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
}

export default async function CommunityVideosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}%2Fvideos`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state')
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">Community not found.</p>
      </div>
    );
  }

  const [{ data: schoolsRaw }, { data: poisRaw }, { data: videosRaw }] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('schools')
      .select('id, name, grades, rating, source_url, recorded_at')
      .eq('community_id', id)
      .order('name', { ascending: true }) as Promise<{ data: SchoolRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('pois')
      .select('id, name, poi_type, distance_text, source_url, recorded_at')
      .eq('community_id', id)
      .order('poi_type', { ascending: true })
      .order('name', { ascending: true }) as Promise<{ data: PoiRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, kind, school_id, poi_id, title, status, created_at')
      .eq('community_id', id)
      .order('created_at', { ascending: false }) as Promise<{
      data: CommunityVideoRow[] | null;
    }>,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{community.name}</h1>
          <p className="mt-1 text-sm text-cream/60">
            {community.city ? `${community.city}, ${community.state}` : community.state} ·{' '}
            <Link
              href={`/dashboard/communities/${community.id}`}
              className="text-cream/70 underline-offset-2 hover:text-gold hover:underline"
            >
              edit details
            </Link>
          </p>
        </div>
        <Link
          href="/dashboard/communities"
          className="shrink-0 text-xs text-cream/60 hover:text-cream"
        >
          ← all communities
        </Link>
      </header>

      <CommunityVideoPanel
        communityId={community.id}
        initialVideos={videosRaw ?? []}
        schools={schoolsRaw ?? []}
        pois={poisRaw ?? []}
      />
    </div>
  );
}
