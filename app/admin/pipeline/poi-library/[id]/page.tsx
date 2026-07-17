/**
 * /admin/pipeline/poi-library/[id] — POI detail + photo review.
 *
 * Photos are the global `poi_photos` rows for this POI. Admin can flag
 * any photo `rejected` (or `approved` — informational, doesn't force
 * anything) which propagates to every listing + community video pool
 * via the filter in lib/poi/*-video-actions.ts.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PhotoReviewClient } from './PhotoReviewClient';

export const dynamic = 'force-dynamic';

type Poi = {
  id: string;
  google_place_id: string;
  display_name: string;
  primary_type: string | null;
  rating: number | null;
  user_rating_count: number | null;
  formatted_address: string | null;
  ai_summary: string | null;
  ai_tags: Record<string, unknown> | null;
  tagged_at: string | null;
  discovered_at: string;
};

type Photo = {
  id: string;
  storage_path: string;
  status: 'pending' | 'approved' | 'rejected';
  width_px: number | null;
  height_px: number | null;
  ai_score: number | null;
  ai_tags: Record<string, unknown> | null;
  applicable_buckets: string[] | null;
  attribution: Record<string, unknown> | null;
  reviewed_at: string | null;
  tagged_at: string | null;
};

const PHOTO_BUCKET = 'listing-photos';

export default async function PoiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();

  const [{ data: poi }, { data: photos }] = await Promise.all([
    supabase
      .from('pois')
      .select(
        'id, google_place_id, display_name, primary_type, rating, user_rating_count, formatted_address, ai_summary, ai_tags, tagged_at, discovered_at',
      )
      .eq('id', id)
      .maybeSingle() as unknown as Promise<{ data: Poi | null }>,
    supabase
      .from('poi_photos')
      .select(
        'id, storage_path, status, width_px, height_px, ai_score, ai_tags, applicable_buckets, attribution, reviewed_at, tagged_at',
      )
      .eq('poi_id', id)
      .order('ai_score', { ascending: false, nullsFirst: false })
      .limit(200) as unknown as Promise<{ data: Photo[] | null }>,
  ]);

  if (!poi) notFound();

  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{poi.display_name}</h1>
        <div className="text-ink2 text-sm">
          {poi.primary_type ?? '—'}
          {typeof poi.rating === 'number' && (
            <>
              {' · '}★ {poi.rating.toFixed(1)}
              {poi.user_rating_count ? ` (${poi.user_rating_count})` : ''}
            </>
          )}
          {poi.formatted_address ? ` · ${poi.formatted_address}` : ''}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink2">
          Photos <span className="text-ink">({photos?.length ?? 0})</span>
        </h2>
        <PhotoReviewClient storageBase={storageBase} bucket={PHOTO_BUCKET} photos={photos ?? []} />
      </section>
    </div>
  );
}
