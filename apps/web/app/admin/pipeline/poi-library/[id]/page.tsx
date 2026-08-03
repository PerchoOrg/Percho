/**
 * /admin/pipeline/poi-library/[id] — POI detail + photo table.
 *
 * Photos are the global `poi_photos` rows for this POI. Admin can flag
 * any photo `rejected` (or `approved` — informational, doesn't force
 * anything) which propagates to every listing + community video pool
 * via the filter in lib/poi/*-video-actions.ts.
 *
 * 2026-08-03: the thumbnail grid + separate enhance panel became one table
 * (`PhotoTable`) — one row per photo with tags, description, buckets, review
 * state, enhancement state, and which videos used it.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PhotoTable } from '../../../_components/PhotoTable';

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
  enhanced_path: string | null;
  enhanced_status: string;
  enhanced_preset: string | null;
  enhanced_error: string | null;
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
        'id, storage_path, status, width_px, height_px, ai_score, ai_tags, applicable_buckets, attribution, reviewed_at, tagged_at, enhanced_path, enhanced_status, enhanced_preset, enhanced_error',
      )
      .eq('poi_id', id)
      .order('ai_score', { ascending: false, nullsFirst: false })
      .limit(200) as unknown as Promise<{ data: Photo[] | null }>,
  ]);

  if (!poi) notFound();

  const rows = photos ?? [];

  // Which videos used each photo. `generated_videos.input_photo_ids` is a uuid[]
  // of poi_photos ids — the only place this provenance exists for POI photos.
  // Only 18 rows carry it, so scan them all rather than building an @> filter
  // per photo.
  const usedIn = new Map<string, string[]>();
  if (rows.length > 0) {
    const { data: vids } = (await supabase
      .from('generated_videos')
      .select('intent_bucket, scope, status, input_photo_ids')
      .not('input_photo_ids', 'is', null)) as {
      data: Array<{
        intent_bucket: string | null;
        scope: string | null;
        status: string;
        input_photo_ids: string[] | null;
      }> | null;
    };
    for (const v of vids ?? []) {
      const label = v.intent_bucket ?? v.scope ?? 'video';
      for (const pid of v.input_photo_ids ?? []) {
        const list = usedIn.get(pid) ?? [];
        if (!list.includes(label)) list.push(label);
        usedIn.set(pid, list);
      }
    }
  }

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

      <PhotoTable
        table="poi_photos"
        storageBase={storageBase}
        bucket={PHOTO_BUCKET}
        photos={rows.map((p) => ({
          ...p,
          poi_id: poi.id,
          poi_name: poi.display_name,
          used_in: usedIn.get(p.id) ?? [],
        }))}
      />
    </div>
  );
}
