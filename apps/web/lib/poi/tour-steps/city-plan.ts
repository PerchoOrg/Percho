/**
 * The city half of the `plan` step (phase322): turn the planner's shots into
 * the city film's two acts. The cut itself is `lib/cities/film.ts`, which is
 * pure; this file only does its reading.
 */
import { type CityCut, type FilmPhoto, type PlaceShot, buildCityCut } from '@/lib/cities/film';
import { parseCityProfile } from '@/lib/zod/city-profile';
import { voiceForCommunity } from '../tour-orchestrator/narration';
import type { RunRow, TourDb } from './shared';

export interface CityPlan extends CityCut {
  narration: {
    ok: true;
    voice: string;
    segments: CityCut['segments'];
    sections: [];
    angles: [];
    warnings: string[];
    error?: undefined;
  };
}

export async function planCityFilm(
  sb: TourDb,
  run: RunRow,
  shots: unknown[],
  cutPoiIds: string[],
  bucketByPoiId: Map<string, string>,
): Promise<CityPlan> {
  const { data: city } = await sb
    .from('cities')
    .select('name, profile')
    .eq('id', run.entity_id)
    .maybeSingle();
  const profile = parseCityProfile(city?.profile);
  if (!city || !profile) {
    throw new Error(
      'this city has no profile yet — its film opens on the fundamentals. Write one with scripts/admin/upsert-city-profile.ts, then plan again',
    );
  }

  const { data: poiRows } = (await sb
    .from('pois')
    .select('id, display_name')
    .in('id', cutPoiIds)) as { data: Array<{ id: string; display_name: string | null }> | null };
  const pois = (poiRows ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? '',
    bucket: bucketByPoiId.get(p.id) ?? 'other',
  }));

  type PhotoRow = {
    id: string;
    poi_id: string;
    ai_tags: {
      description?: string;
      primary_category?: string;
      tags?: string[];
      usable?: boolean;
    } | null;
    storage_path: string;
    enhanced_path: string | null;
    enhanced_status: string | null;
  };
  const photoRows: PhotoRow[] = [];
  for (let i = 0; i < cutPoiIds.length; i += 100) {
    const { data } = (await sb
      .from('poi_photos')
      .select('id, poi_id, ai_tags, storage_path, enhanced_path, enhanced_status')
      .in('poi_id', cutPoiIds.slice(i, i + 100))
      .neq('status', 'rejected')
      .order('ai_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })) as { data: PhotoRow[] | null };
    photoRows.push(...(data ?? []));
  }
  const photos: FilmPhoto[] = photoRows
    .filter((p) => p.ai_tags?.usable !== false)
    .map((p) => ({
      id: p.id,
      poiId: p.poi_id,
      description: p.ai_tags?.description ?? '',
      category: p.ai_tags?.primary_category ?? null,
      tags: p.ai_tags?.tags ?? [],
      path: p.enhanced_status === 'approved' && p.enhanced_path ? p.enhanced_path : p.storage_path,
    }));

  const placeShots = shots as PlaceShot[];
  const { data: ready } = (await sb
    .from('photo_clips')
    .select('photo_id')
    .in(
      'photo_id',
      placeShots.map((s) => s.photo_id),
    )
    .eq('engine', 'seedance')
    .eq('status', 'ready')) as { data: Array<{ photo_id: string }> | null };

  const cut = buildCityCut({
    cityName: city.name,
    profile,
    shots: placeShots,
    photos,
    pois,
    seedanceReady: new Set((ready ?? []).map((r) => r.photo_id)),
  });

  return {
    ...cut,
    narration: {
      ok: true,
      voice: voiceForCommunity(run.entity_id),
      segments: cut.segments,
      sections: [],
      angles: [],
      warnings: cut.warnings,
    },
  };
}
