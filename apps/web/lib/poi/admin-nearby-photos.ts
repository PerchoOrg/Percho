/**
 * Flat photo rows for an admin nearby page (community or listing scope).
 *
 * A plain server module, not `'use server'`: it reads on the service role and
 * its only callers are the two admin Server Components. As a server action it
 * was an unauthenticated endpoint any browser could call.
 *
 * The nearby pages used to show photos only inside a per-POI accordion, which
 * makes "which photos does this community actually have, and which are in a
 * video" a click-through-30-POIs job. This flattens them into the same shape
 * `PhotoTable` renders on the Home Tour / POI pages.
 *
 * Photos live in the GLOBAL `poi_photos` table; `{community,listing}_poi_photos`
 * carries the per-scope review status. The table shows the global row (that's
 * what the renderer reads) — per-scope curation stays in the POI panel.
 *
 * A CITY is the exception (phase343): its table shows the city's own verdict
 * (`city_poi_photos`), with what communities and other cities decided beside
 * it as a reference, and "used in" is the city's current film.
 */

import { cityVerdict, elsewhereNote } from '@/lib/cities/photo-verdict';
import { readCityVerdictRows } from '@/lib/cities/photo-verdict-store';
import { type TypedClient, createServiceClient } from '@/lib/supabase/server';
import { keepPhotoForTour } from './nearby-photo-scope';
import { tourPoiIds } from './tour-poi-set';
import {
  CITY_TOUR,
  COMMUNITY_TOUR,
  type TourScope,
  idColumnOf,
  runsTableOf,
} from './tour-steps/scope';

export interface NearbyPhotoRow {
  id: string;
  storage_path: string;
  status: string | null;
  rejection_reason: string | null;
  width_px: number | null;
  height_px: number | null;
  ai_score: number | null;
  ai_tags: Record<string, unknown> | null;
  applicable_buckets: string[] | null;
  tagged_at: string | null;
  enhanced_path: string | null;
  enhanced_status: string;
  enhanced_preset: string | null;
  enhanced_error: string | null;
  poi_name: string | null;
  poi_id: string;
  source: string | null;
  attribution: Record<string, unknown> | null;
  outpainted_path: string | null;
  outpaint_status: string | null;
  outpaint_meta: Record<string, unknown> | null;
  outpaint_error: string | null;
  used_in: string[];
  /** City only: what other places decided about this photo, for reference. */
  elsewhere?: string | null;
}

type Scope =
  | { kind: 'community'; id: string }
  | { kind: 'listing'; id: string }
  | { kind: 'city'; id: string };

/**
 * Drop the photos that belong to POIs the tour never resolved.
 *
 * The set is rebuilt from the newest run that HAS a resolve result rather than
 * from the newest run: a run that died in `photos` (or one still researching)
 * carries no resolved list, and reading it would empty the page. A community
 * with no resolve result at all has never been toured — its nearby photos are
 * all there is, so nothing is narrowed.
 */
async function narrowToTour<
  T extends { poi_id: string; status: string | null; reviewed_by: string | null },
>(sb: TypedClient, tour: TourScope, communityId: string, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const { data: runs } = (await sb
    .from(runsTableOf(tour))
    .select('step_results')
    .eq(idColumnOf(tour), communityId)
    .order('created_at', { ascending: false })
    .limit(10)) as {
    data: Array<{ step_results: { resolve?: { resolved?: Array<{ place_id?: string }> } } }> | null;
  };
  const resolved = (runs ?? [])
    .map((r) => r.step_results?.resolve?.resolved)
    .find((r) => r && r.length > 0);
  if (!resolved) return rows;

  // Same set the fetch and tag steps work off — one definition, in
  // tour-poi-set.ts.
  const focusPoiIds = await tourPoiIds(sb, communityId, resolved, tour);

  return rows.filter((row) => keepPhotoForTour(row, focusPoiIds));
}

export async function loadNearbyPhotos(scope: Scope): Promise<NearbyPhotoRow[]> {
  const sb = createServiceClient();

  const columns = 'poi_id, intent_bucket, pois!inner(display_name)';
  const { data: links } = (await (scope.kind === 'community'
    ? sb.from('community_pois').select(columns).eq('community_id', scope.id)
    : scope.kind === 'city'
      ? sb.from('city_pois').select(columns).eq('city_id', scope.id)
      : sb.from('listing_pois').select(columns).eq('listing_id', scope.id))) as {
    data: Array<{
      poi_id: string;
      intent_bucket: string | null;
      pois: { display_name: string } | null;
    }> | null;
  };

  const poiIds = [...new Set((links ?? []).map((l) => l.poi_id))];
  if (poiIds.length === 0) return [];

  const nameByPoi = new Map<string, string>();
  for (const l of links ?? []) {
    if (l.pois?.display_name) nameByPoi.set(l.poi_id, l.pois.display_name);
  }

  const { data: photos } = (await sb
    .from('poi_photos')
    .select(
      'id, poi_id, storage_path, status, rejection_reason, width_px, height_px, ai_score, ai_tags, applicable_buckets, tagged_at, enhanced_path, enhanced_status, enhanced_preset, enhanced_error, outpainted_path, outpaint_status, outpaint_meta, outpaint_error, source, attribution, created_at, reviewed_by',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1000)) as {
    data: Array<
      Omit<NearbyPhotoRow, 'poi_name' | 'used_in'> & {
        created_at: string;
        reviewed_by: string | null;
      }
    > | null;
  };

  const scoped =
    scope.kind === 'city' ? await withCityVerdicts(sb, scope.id, photos ?? []) : photos;
  const rows =
    scope.kind === 'listing'
      ? (scoped ?? [])
      : await narrowToTour(
          sb,
          scope.kind === 'city' ? CITY_TOUR : COMMUNITY_TOUR,
          scope.id,
          scoped ?? [],
        );
  if (rows.length === 0) return [];

  // Which rendered videos used each photo. Scoped to THIS owner — a photo used
  // in another community's video is not "in this community's video".
  // A city has no bucket videos (phase318); its one video is the film.
  const usedIn =
    scope.kind === 'city' ? await cityFilmPhotos(sb, scope.id) : new Map<string, string[]>();
  const { data: vids } = (
    scope.kind === 'city'
      ? { data: [] }
      : await sb
          .from('generated_videos')
          .select('intent_bucket, scope, input_photo_ids')
          .eq(scope.kind === 'community' ? 'community_id' : 'listing_id', scope.id)
          .not('input_photo_ids', 'is', null)
  ) as {
    data: Array<{
      intent_bucket: string | null;
      scope: string | null;
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

  // Which photos have an AI clip (photo_clips ready). These must survive the
  // per-POI display cap even if they fell outside the newest-3 window.
  const clipPhotoIds = new Set<string>();
  const { data: clips } = (await sb
    .from('photo_clips')
    .select('photo_id')
    .eq('status', 'ready')) as { data: Array<{ photo_id: string }> | null };
  for (const c of clips ?? []) clipPhotoIds.add(c.photo_id);

  const full = rows.map((p) => ({
    ...p,
    poi_name: nameByPoi.get(p.poi_id) ?? null,
    used_in: usedIn.get(p.id) ?? [],
  }));

  // Owner 2026-08-17: each POI shows the LATEST fetch's photos (3), plus any
  // photo that has an AI clip (photo_clips ready). Historical fetches
  // accumulated 10-14 photos per POI (content-hash dedup reuses, never
  // deletes — by design). Display-only trim; DB untouched.
  //
  // The cap is about stale Google fetches piling up, so it does not apply to
  // 'community_site' photos: an admin pasted that page precisely to review
  // everything on it, and hiding all but three would defeat the feature.
  const POI_PHOTO_CAP = 3;
  const byPoi = new Map<string, NearbyPhotoRow[]>();
  const handPicked: NearbyPhotoRow[] = [];
  for (const row of full) {
    if (row.source === 'community_site') {
      handPicked.push(row);
      continue;
    }
    const arr = byPoi.get(row.poi_id) ?? [];
    arr.push(row);
    byPoi.set(row.poi_id, arr);
  }
  const trimmed: NearbyPhotoRow[] = [...handPicked];
  for (const [_pid, arr] of byPoi) {
    // rows are already sorted created_at desc; keep the newest cap, then
    // append any photo with an AI clip that fell outside the cap.
    const kept = arr.slice(0, POI_PHOTO_CAP);
    const keptIds = new Set(kept.map((r) => r.id));
    for (const row of arr.slice(POI_PHOTO_CAP)) {
      if (clipPhotoIds.has(row.id) && !keptIds.has(row.id)) {
        kept.push(row);
        keptIds.add(row.id);
      }
    }
    trimmed.push(...kept);
  }
  return trimmed;
}

/**
 * Swap the shared verdict for the city's own, and keep the shared one — and
 * any other city's — as a reference line (phase343).
 */
async function withCityVerdicts<
  T extends {
    id: string;
    status: string | null;
    rejection_reason: string | null;
    reviewed_by: string | null;
  },
>(sb: TypedClient, cityId: string, rows: T[]): Promise<Array<T & { elsewhere: string | null }>> {
  const own = await readCityVerdictRows(sb, cityId);

  const others = new Map<
    string,
    Array<{ name: string; status: string; rejection_reason: string | null }>
  >();
  for (let i = 0; i < rows.length; i += 100) {
    const { data } = (await sb
      .from('city_poi_photos')
      .select('poi_photo_id, status, rejection_reason, cities!inner(name)')
      .in(
        'poi_photo_id',
        rows.slice(i, i + 100).map((r) => r.id),
      )
      .neq('city_id', cityId)) as {
      data: Array<{
        poi_photo_id: string;
        status: string;
        rejection_reason: string | null;
        cities: { name: string } | null;
      }> | null;
    };
    for (const o of data ?? []) {
      const list = others.get(o.poi_photo_id) ?? [];
      list.push({
        name: o.cities?.name ?? 'another city',
        status: o.status,
        rejection_reason: o.rejection_reason,
      });
      others.set(o.poi_photo_id, list);
    }
  }

  return rows.map((r) => {
    const v = cityVerdict(r, own.get(r.id));
    return {
      ...r,
      status: v.status,
      rejection_reason: v.everywhere ? `everywhere — ${v.reason ?? 'legal'}` : v.reason,
      reviewed_by: v.reviewedBy,
      elsewhere: elsewhereNote(r, others.get(r.id) ?? []),
    };
  });
}

/** The photos in the city's newest ready film, each labelled "film". */
async function cityFilmPhotos(sb: TypedClient, cityId: string): Promise<Map<string, string[]>> {
  const { data } = (await sb
    .from('city_tour_assemblies')
    .select('ordered_clips')
    .eq('city_id', cityId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { ordered_clips: Array<{ photo_id?: string }> | null } | null };
  const out = new Map<string, string[]>();
  for (const c of data?.ordered_clips ?? []) if (c.photo_id) out.set(c.photo_id, ['film']);
  return out;
}
