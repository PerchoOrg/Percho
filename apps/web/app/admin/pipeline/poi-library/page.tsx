/**
 * /admin/pipeline/poi-library — global POI + poi_photos audit.
 * Shows what the discovery + AI-tag steps have produced.
 *
 * moved rendering into <PoiLibraryTable>
 * (shared AdminTable: search / sort / pagination). Removed the
 * server-side search form + tagged/photos <select> filters — the
 * new table's search + sortable columns cover the same ground.
 */

import { createServiceClient } from '@/lib/supabase/server';
import PoiLibraryTable, { type PoiRow } from './PoiLibraryTable';

export const dynamic = 'force-dynamic';

type DbRow = {
  id: string;
  google_place_id: string;
  display_name: string;
  primary_type: string | null;
  rating: number | null;
  ai_summary: string | null;
  tagged_at: string | null;
  discovered_at: string;
};

export default async function PoiLibraryPage() {
  const supabase = createServiceClient();

  const [{ data, count }, photoAgg, poiIdsWithPhotos] = await Promise.all([
    supabase
      .from('pois')
      .select(
        'id, google_place_id, display_name, primary_type, rating, ai_summary, tagged_at, discovered_at',
        { count: 'exact' },
      )
      .order('discovered_at', { ascending: false })
      .limit(500) as unknown as Promise<{ data: DbRow[] | null; count: number | null }>,
    supabase.from('poi_photos').select('id', { count: 'exact', head: true }),
    supabase.from('poi_photos').select('poi_id').limit(20000) as unknown as Promise<{
      data: Array<{ poi_id: string }> | null;
    }>,
  ]);

  const withPhotos = new Set<string>();
  for (const p of poiIdsWithPhotos.data ?? []) withPhotos.add(p.poi_id);

  const rows: PoiRow[] = (data ?? []).map((r) => ({
    id: r.id,
    google_place_id: r.google_place_id,
    display_name: r.display_name,
    primary_type: r.primary_type,
    rating: r.rating,
    ai_summary: r.ai_summary,
    tagged_at: r.tagged_at,
    hasPhotos: withPhotos.has(r.id),
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm text-ink2">
        <span>
          <b className="text-ink">{count ?? 0}</b> POIs
        </span>
        <span>
          <b className="text-ink">{photoAgg.count ?? 0}</b> photos
        </span>
      </div>
      <PoiLibraryTable rows={rows} />
    </div>
  );
}
