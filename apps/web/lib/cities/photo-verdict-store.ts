/**
 * Read and write a city's photo verdicts — `city_poi_photos` (phase343).
 * The rules are in `photo-verdict.ts`; this is only the table.
 */
import { readAllPages } from '@/lib/supabase/paginate';
import type { TypedClient } from '@/lib/supabase/server';
import type { CityVerdictRow, Verdict } from './photo-verdict';

/** Every verdict row the city holds, by photo id. */
export async function readCityVerdictRows(
  sb: TypedClient,
  cityId: string,
): Promise<Map<string, CityVerdictRow>> {
  const rows = await readAllPages<CityVerdictRow & { poi_photo_id: string }>((from, to) =>
    sb
      .from('city_poi_photos')
      .select('poi_photo_id, status, rejection_reason, reviewed_by')
      .eq('city_id', cityId)
      .order('poi_photo_id')
      .range(from, to),
  );
  return new Map(rows.map((r) => [r.poi_photo_id, r]));
}

/** Set one verdict on many photos. `reviewedBy` null = the pipeline decided. */
export async function writeCityVerdicts(
  sb: TypedClient,
  cityId: string,
  photoIds: readonly string[],
  verdict: { status: Verdict; reason?: string | null; reviewedBy?: string | null },
): Promise<void> {
  const reviewedAt = new Date().toISOString();
  for (let i = 0; i < photoIds.length; i += 200) {
    const { error } = await sb.from('city_poi_photos').upsert(
      photoIds.slice(i, i + 200).map((id) => ({
        city_id: cityId,
        poi_photo_id: id,
        status: verdict.status,
        rejection_reason: verdict.status === 'rejected' ? (verdict.reason ?? null) : null,
        reviewed_by: verdict.reviewedBy ?? null,
        reviewed_at: reviewedAt,
      })),
      { onConflict: 'city_id,poi_photo_id' },
    );
    if (error) {
      throw new Error(
        `city verdict ${verdict.status} on ${photoIds.length} photo(s): ${error.message}`,
      );
    }
  }
}
