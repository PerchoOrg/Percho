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
      'id, poi_id, storage_path, status, width_px, height_px, ai_score, ai_tags, applicable_buckets, tagged_at, enhanced_path, enhanced_status, enhanced_preset, enhanced_error',
    )
    .in('poi_id', poiIds)
    .order('ai_score', { ascending: false, nullsFirst: false })
    .limit(1000)) as {
    data: Array<Omit<NearbyPhotoRow, 'poi_name' | 'used_in'>> | null;
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

  return rows.map((p) => ({
    ...p,
    poi_name: nameByPoi.get(p.poi_id) ?? null,
    used_in: usedIn.get(p.id) ?? [],
  }));
}
