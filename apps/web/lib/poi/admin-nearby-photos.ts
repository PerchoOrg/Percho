'use server';

/**
 * Flat photo rows for an admin nearby page (community or listing scope).
 *
 * The nearby pages used to show photos only inside a per-POI accordion, which
 * makes "which photos does this community actually have, and which are in a
 * video" a click-through-30-POIs job. This flattens them into the same shape
 * `PhotoTable` renders on the Home Tour / POI pages.
 *
 * Photos live in the GLOBAL `poi_photos` table; `{community,listing}_poi_photos`
 * carries the per-scope review status. The table shows the global row (that's
 * what the renderer reads) — per-scope curation stays in the POI panel.
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface NearbyPhotoRow {
  id: string;
  storage_path: string;
  status: string | null;
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
}

type Scope = { kind: 'community'; id: string } | { kind: 'listing'; id: string };

export async function loadNearbyPhotos(scope: Scope): Promise<NearbyPhotoRow[]> {
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const linkTable = scope.kind === 'community' ? 'community_pois' : 'listing_pois';
  const ownerCol = scope.kind === 'community' ? 'community_id' : 'listing_id';

  const { data: links } = (await sb
    .from(linkTable)
    .select('poi_id, intent_bucket, pois!inner(display_name)')
    .eq(ownerCol, scope.id)) as {
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
      'id, poi_id, storage_path, status, width_px, height_px, ai_score, ai_tags, applicable_buckets, tagged_at, enhanced_path, enhanced_status, enhanced_preset, enhanced_error, outpainted_path, outpaint_status, outpaint_meta, outpaint_error, source, attribution, created_at',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1000)) as {
    data: Array<Omit<NearbyPhotoRow, 'poi_name' | 'used_in'> & { created_at: string }> | null;
  };

  const rows = photos ?? [];
  if (rows.length === 0) return [];

  // Which rendered videos used each photo. Scoped to THIS owner — a photo used
  // in another community's video is not "in this community's video".
  const usedIn = new Map<string, string[]>();
  const { data: vids } = (await sb
    .from('generated_videos')
    .select('intent_bucket, scope, input_photo_ids')
    .eq(ownerCol, scope.id)
    .not('input_photo_ids', 'is', null)) as {
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
