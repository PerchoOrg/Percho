/**
 * /admin/pipeline/tour-jobs/[id] — one home's tour pipeline.
 *
 * Was: a header with three Generate buttons, a list of video previews, and a
 * photo table with most of its columns switched off. The whole pipeline
 * between "click Generate" and "a film exists" was one Python function and
 * nothing on this page could see into it.
 *
 * Now the page is the same shape as the Community Tour admin — facts and the
 * latest cut on top, the pipeline as a row of chips, and one big table where
 * every photo is reviewed, planned and rendered (owner 2026-08-20: "the goal
 * is to have a similar big table for home tour as well, with all the columns,
 * buttons if needed").
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { HomeTourSection } from '../../../_components/HomeTourSection';
import type { PhotoRow } from '../../../_components/PhotoTable';
import { AdminGenerateTourButton } from './AdminGenerateTourButton';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

interface Params {
  id: string;
}

export default async function AdminTourJobsDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: listing } = (await supabase
    .from('listings')
    .select('id, address, city, state, zip, status, agents(name, slug)')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      address: string;
      city: string;
      state: string;
      zip: string | null;
      status: string;
      agents: { name: string; slug: string } | null;
    } | null;
  };

  if (!listing) notFound();

  const [photoRes, videoRes] = await Promise.all([
    supabase
      .from('listing_photos')
      .select(
        'id, storage_path, sort_order, width, height, ai_tags, ai_score, tagged_at, used_in_video_at, used_clip_index, enhanced_path, enhanced_status, enhanced_preset, enhanced_error, review_status, rejection_reason',
      )
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }) as unknown as Promise<{
      data: PhotoRow[] | null;
    }>,
    supabase
      .from('listing_videos')
      .select(
        'id, cf_video_id, cf_video_id_landscape, cf_video_id_square, kind, status, created_at',
      )
      .eq('listing_id', id)
      .eq('kind', 'walkthrough')
      .order('created_at', { ascending: false })
      .limit(1) as unknown as Promise<{
      data: Array<{
        id: string;
        cf_video_id: string | null;
        cf_video_id_landscape: string | null;
        cf_video_id_square: string | null;
        kind: string;
        status: string;
        created_at: string;
      }> | null;
    }>,
  ]);

  const photos = photoRes.data ?? [];
  const video = videoRes.data?.[0];

  return (
    <HomeTourSection
      listingId={listing.id}
      address={listing.address}
      city={listing.city}
      state={listing.state}
      zip={listing.zip}
      agentName={listing.agents?.name ?? null}
      storageBase={SUPABASE_URL}
      bucket="listing-photos"
      photos={photos}
      latestVideo={
        video
          ? {
              // iOS plays the square-named column; web plays landscape, with
              // the legacy portrait column as the fallback webVideoUid()
              // applies for old rows.
              iosUid: video.cf_video_id_square,
              webUid: video.cf_video_id_landscape ?? video.cf_video_id,
              status: video.status,
            }
          : null
      }
      legacyAction={<AdminGenerateTourButton listingId={listing.id} photoCount={photos.length} />}
    />
  );
}
