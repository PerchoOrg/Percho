'use server';

/**
 * Community-scoped POI content pipeline — mirror of `lib/poi/actions.ts`
 * but keyed on `community_id` instead of `listing_id`.
 *
 * . Rationale: nearby content is neighborhood-shared,
 * so approving a Whole Foods photo for the "Waterside" subdivision benefits
 * every listing inside it. The listing-scoped tables (`listing_pois` /
 * `listing_poi_photos`) stay for Phase 92 to avoid a big-bang UI cutover;
 * new work funnels into `community_pois` / `community_poi_photos`.
 *
 * Auth model: communities are shared per 0013 (`created_by` is metadata,
 * not gating). Any authenticated agent may read/write community_pois. We
 * still require `auth.getUser()` so anonymous callers are rejected up-front.
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  DEFAULT_INCLUDED_TYPES,
  type PlaceResult,
  bucketByPlaceType,
  fetchPhotoBinary,
  haversineMeters,
  searchNearby,
} from './google-places';
import type { IntentBucket, PhotoStatus, PoiStatus, ReviewAction } from './types';

const POI_PHOTO_BUCKET = 'listing-photos'; // shared with listing-scope pipeline

type CommunityAnchor = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
};

async function requireAuthedCommunity(communityId: string): Promise<CommunityAnchor> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('not authenticated');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community, error } = (await (supabase as any)
    .from('communities')
    .select('id, name, lat, lng')
    .eq('id', communityId)
    .maybeSingle()) as { data: CommunityAnchor | null; error: unknown };

  if (error) throw error;
  if (!community) throw new Error(`community ${communityId} not found`);
  return community;
}

// ─── discovery ──────────────────────────────────────────────────────────────

export type CommunityDiscoverResult = {
  discovered: number;
  reused: number;
  buckets: Partial<Record<IntentBucket, number>>;
};

/**
 * Fetch nearby POIs from Google Places, upsert `pois`, insert `community_pois`
 * scoped to this community. Requires the community to have lat/lng — enforced
 * at the DB seeding step (§25 anchor = subdivision center).
 */
export async function discoverPoisForCommunity(
  communityId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<CommunityDiscoverResult> {
  const community = await requireAuthedCommunity(communityId);
  if (community.lat == null || community.lng == null) {
    throw new Error(
      `community "${community.name}" has no lat/lng — geocode the subdivision anchor first`,
    );
  }

  const center = { lat: Number(community.lat), lng: Number(community.lng) };
  // §25 default: 3km from subdivision entrance (~1.86 mi). Callers can widen.
  const radius = opts.radiusMeters ?? 3000;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const buckets: Partial<Record<IntentBucket, number>> = {};

  const categoryResults = await Promise.all(
    (opts.includedTypes ?? DEFAULT_INCLUDED_TYPES).map((t) =>
      searchNearby({ center, radius, includedTypes: [t], maxResultCount: 20 }).catch((err) => {
        console.error(`[community-poi] searchNearby(${t}) failed:`, err);
        return [] as PlaceResult[];
      }),
    ),
  );
  const allPlaces = categoryResults.flat();

  // Dedup by place id across categories.
  const dedup = new Map<string, PlaceResult>();
  for (const p of allPlaces) if (p.id && !dedup.has(p.id)) dedup.set(p.id, p);

  let discovered = 0;
  let reused = 0;

  for (const place of dedup.values()) {
    if (!place.location) continue;

    const { data: poiRow, error: upsertErr } = (await admin
      .from('pois')
      .upsert(
        {
          google_place_id: place.id,
          display_name: place.displayName?.text ?? '(unnamed)',
          formatted_address: place.formattedAddress ?? null,
          primary_type: place.primaryType ?? null,
          types: place.types ?? null,
          rating: place.rating ?? null,
          user_ratings_total: place.userRatingCount ?? null,
          business_status: place.businessStatus ?? null,
          location: `(${place.location.longitude},${place.location.latitude})`,
          raw_place: place,
          refreshed_at: new Date().toISOString(),
        },
        { onConflict: 'google_place_id' },
      )
      .select('id')
      .single()) as { data: { id: string } | null; error: unknown };

    if (upsertErr || !poiRow) {
      console.error(`[community-poi] upsert pois failed for ${place.id}:`, upsertErr);
      continue;
    }

    const dMeters = Math.round(
      haversineMeters(center, {
        lat: place.location.latitude,
        lng: place.location.longitude,
      }),
    );
    const bucket = bucketByPlaceType(place.primaryType, place.types) as IntentBucket | null;
    if (!bucket) continue;

    const { data: existing } = (await admin
      .from('community_pois')
      .select('community_id')
      .eq('community_id', communityId)
      .eq('poi_id', poiRow.id)
      .maybeSingle()) as { data: { community_id: string } | null };

    if (existing) {
      reused += 1;
    } else {
      const { error: cpErr } = await admin.from('community_pois').insert({
        community_id: communityId,
        poi_id: poiRow.id,
        intent_bucket: bucket,
        distance_m: dMeters,
        status: 'candidate',
      });
      if (cpErr) {
        console.error(`[community-poi] insert community_pois failed:`, cpErr);
        continue;
      }
      discovered += 1;
    }

    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }

  revalidatePath(`/dashboard/communities/${communityId}`);
  return { discovered, reused, buckets };
}

// ─── photo fetch ────────────────────────────────────────────────────────────

export type CommunityPhotoFetchResult = {
  fetched: number;
  reused: number;
  skipped: number;
  skippedReasons?: string[];
};

export async function fetchPhotosForCommunityPoi(
  communityId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<CommunityPhotoFetchResult> {
  await requireAuthedCommunity(communityId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const { data: poi, error: poiErr } = (await admin
    .from('pois')
    .select('id, google_place_id, raw_place')
    .eq('id', poiId)
    .single()) as {
    data: { id: string; google_place_id: string; raw_place: PlaceResult | null } | null;
    error: unknown;
  };
  if (poiErr || !poi) throw new Error(`poi ${poiId} not found`);

  const photos = poi.raw_place?.photos ?? [];
  const max = Math.min(opts.max ?? 10, 10);
  const targets = photos.slice(0, max);

  let fetched = 0;
  let reused = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];
  const noteSkip = (reason: string) => {
    skipped += 1;
    if (skippedReasons.length < 3) skippedReasons.push(reason);
  };

  for (const photo of targets) {
    const { data: existingPhoto } = (await admin
      .from('poi_photos')
      .select('id')
      .eq('google_photo_name', photo.name)
      .maybeSingle()) as { data: { id: string } | null };

    let poiPhotoId: string;

    if (existingPhoto) {
      poiPhotoId = existingPhoto.id;
      reused += 1;
    } else {
      let blob;
      try {
        blob = await fetchPhotoBinary(photo.name, { maxHeightPx: opts.maxHeightPx ?? 1200 });
      } catch (err) {
        console.error(`[community-poi] fetch photo ${photo.name} failed:`, err);
        noteSkip(`Google Places fetch: ${(err as Error).message ?? 'unknown'}`);
        continue;
      }

      const storagePath = `poi/${poi.id}/${hashName(photo.name)}.jpg`;
      const { error: upErr } = await admin.storage
        .from(POI_PHOTO_BUCKET)
        .upload(storagePath, blob.bytes, { contentType: blob.contentType, upsert: true });
      if (upErr) {
        console.error(`[community-poi] storage upload failed:`, upErr);
        noteSkip(`Storage upload: ${(upErr as { message?: string }).message ?? 'unknown'}`);
        continue;
      }

      const { data: upserted, error: upsertErr } = (await admin
        .from('poi_photos')
        .upsert(
          {
            poi_id: poi.id,
            source: 'google_places',
            google_photo_name: photo.name,
            storage_path: storagePath,
            width_px: photo.widthPx ?? null,
            height_px: photo.heightPx ?? null,
            bytes: blob.bytes.length,
            attribution: { authorAttributions: photo.authorAttributions ?? [] },
          },
          { onConflict: 'google_photo_name' },
        )
        .select('id, created_at')
        .single()) as {
        data: { id: string; created_at: string } | null;
        error: unknown;
      };

      if (upsertErr || !upserted) {
        console.error(`[community-poi] upsert poi_photos failed:`, upsertErr);
        noteSkip(`DB upsert: ${(upsertErr as { message?: string })?.message ?? 'unknown'}`);
        continue;
      }
      poiPhotoId = upserted.id;
      const ageMs = Date.now() - new Date(upserted.created_at).getTime();
      if (ageMs < 5_000) fetched += 1;
      else reused += 1;
    }

    // Ensure per-community review row exists in pending state.
    const { data: existingLink } = (await admin
      .from('community_poi_photos')
      .select('community_id')
      .eq('community_id', communityId)
      .eq('poi_photo_id', poiPhotoId)
      .maybeSingle()) as { data: { community_id: string } | null };

    if (!existingLink) {
      await admin.from('community_poi_photos').insert({
        community_id: communityId,
        poi_photo_id: poiPhotoId,
        status: 'pending',
      });
    }
  }

  revalidatePath(`/dashboard/communities/${communityId}`);
  return { fetched, reused, skipped, ...(skippedReasons.length ? { skippedReasons } : {}) };
}

// ─── review actions ─────────────────────────────────────────────────────────

export async function setCommunityPoiStatus(communityId: string, poiId: string, status: PoiStatus) {
  await requireAuthedCommunity(communityId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  const { error } = await supabase
    .from('community_pois')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('community_id', communityId)
    .eq('poi_id', poiId);
  if (error) throw error;

  revalidatePath(`/dashboard/communities/${communityId}`);
}

export async function setCommunityPhotoStatus(
  communityId: string,
  poiPhotoId: string,
  status: PhotoStatus,
) {
  await requireAuthedCommunity(communityId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  const { error } = await supabase
    .from('community_poi_photos')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('community_id', communityId)
    .eq('poi_photo_id', poiPhotoId);
  if (error) throw error;

  revalidatePath(`/dashboard/communities/${communityId}`);

  // Fire-and-forget vision tagging on approve, same pattern as listing side.
  if (status === 'approved') {
    import('@/lib/poi/vision-tagger')
      .then(({ tagPoiPhoto }) => tagPoiPhoto(poiPhotoId))
      .catch((err) => console.error('[community-poi] vision tag dispatch failed:', err));
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

export type NearbyPoiForCommunity = {
  poi_id: string;
  intent_bucket: IntentBucket;
  distance_m: number | null;
  status: PoiStatus;
  ai_score: number | null;
  discovered_at: string;
  reviewed_at: string | null;
  pois: {
    id: string;
    display_name: string;
    formatted_address: string | null;
    primary_type: string | null;
    rating: number | null;
    user_ratings_total: number | null;
  };
  photos: Array<{
    status: PhotoStatus;
    poi_photo_id: string;
    poi_photos: {
      storage_path: string;
      attribution: Record<string, unknown> | null;
      ai_tags: { description?: string; primary_category?: string } | null;
      tagged_at: string | null;
    };
  }>;
};

/**
 * Full snapshot for the community dashboard's Nearby panel — same shape as
 * `loadNearbyPoisForListing` but scoped to the community. Two-query pattern
 * because community_pois / community_poi_photos share community_id + poi_id
 * (via poi_photos.poi_id) but have no direct FK — see actions.ts §507 note.
 */
export async function loadNearbyPoisForCommunity(
  communityId: string,
): Promise<NearbyPoiForCommunity[]> {
  // Admin bypass — same reason as loadNearbyPoisForListing (DEVLOG 2026-07-17).
  // community_pois SELECT policy scopes to shared/owned communities; an admin
  // reviewing another agent's community sees empty results without bypass.
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new Error('not authenticated');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (userClient as any)
    .from('agents')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { is_admin: boolean } | null };

  const isAdmin = !!agent?.is_admin;
  if (!isAdmin) {
    await requireAuthedCommunity(communityId);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = isAdmin ? createServiceClient() : userClient;

  const { data: rows, error } = (await supabase
    .from('community_pois')
    .select(
      `
      poi_id, intent_bucket, distance_m, status, ai_score, discovered_at, reviewed_at,
      pois!inner(id, display_name, formatted_address, primary_type, rating, user_ratings_total)
    `,
    )
    .eq('community_id', communityId)
    .order('distance_m', { ascending: true })) as {
    data: Array<Omit<NearbyPoiForCommunity, 'photos'>> | null;
    error: unknown;
  };

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: photoRows, error: photoErr } = (await supabase
    .from('community_poi_photos')
    .select(
      `
      status, poi_photo_id,
      poi_photos!inner(poi_id, storage_path, attribution, ai_tags, tagged_at)
    `,
    )
    .eq('community_id', communityId)) as {
    data: Array<{
      status: PhotoStatus;
      poi_photo_id: string;
      poi_photos: {
        poi_id: string;
        storage_path: string;
        attribution: Record<string, unknown> | null;
        ai_tags: { description?: string; primary_category?: string } | null;
        tagged_at: string | null;
      };
    }> | null;
    error: unknown;
  };

  if (photoErr) throw photoErr;

  const photosByPoi = new Map<string, NearbyPoiForCommunity['photos']>();
  for (const p of photoRows ?? []) {
    const poiId = p.poi_photos.poi_id;
    const list = photosByPoi.get(poiId) ?? [];
    list.push({
      status: p.status,
      poi_photo_id: p.poi_photo_id,
      poi_photos: {
        storage_path: p.poi_photos.storage_path,
        attribution: p.poi_photos.attribution,
        ai_tags: p.poi_photos.ai_tags,
        tagged_at: p.poi_photos.tagged_at,
      },
    });
    photosByPoi.set(poiId, list);
  }

  return rows.map((r) => ({
    ...r,
    photos: photosByPoi.get(r.poi_id) ?? [],
  }));
}

// ─── util ──────────────────────────────────────────────────────────────────

function hashName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Silence "unused" lint if a future refactor drops the helper — kept alongside
// callers so it moves as one unit when this file splits.
export type { ReviewAction };
