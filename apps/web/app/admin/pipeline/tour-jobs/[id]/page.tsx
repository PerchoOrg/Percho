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
 *
 * The legacy whole-film button is gone (owner 2026-08-21), now that the
 * per-photo path has produced a film end to end. `process_job()` itself
 * REMAINS: the agent dashboard's one-click "Create a home tour video"
 * (`GenerateTourPanel` -> /api/listings/[id]/generate-tour) still enqueues
 * step='render' jobs against it, and that is a live agent-facing feature, not
 * the admin fallback being retired here.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { HomeTourSection } from '../../../_components/HomeTourSection';
import type { PhotoRow } from '../../../_components/PhotoTable';

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

  const { data: photoData } = (await supabase
    .from('listing_photos')
    .select(
      'id, storage_path, sort_order, width, height, ai_tags, ai_score, tagged_at, used_in_video_at, used_clip_index, enhanced_path, enhanced_status, enhanced_preset, enhanced_error, review_status, rejection_reason',
    )
    .eq('listing_id', id)
    .order('sort_order', { ascending: true })) as unknown as { data: PhotoRow[] | null };

  const photos = photoData ?? [];

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
    />
  );
}
