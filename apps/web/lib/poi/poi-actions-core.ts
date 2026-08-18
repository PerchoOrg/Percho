/**
 * The POI discovery / photo-fetch / review pipeline, written once and
 * parameterised by `PoiEntityScope`. `listing-actions.ts` and
 * `community-actions.ts` are thin 'use server' adapters over this.
 *
 * POIs and their photos are GLOBAL — `pois` and `poi_photos` are keyed on
 * google_place_id / google_photo_name and shared across listings AND
 * communities. Only the join rows (`<scope>_pois`, `<scope>_poi_photos`)
 * are per-entity.
 *
 * Auth: the join tables are owner-scoped through the entity, so any
 * authenticated caller must resolve the entity to read/write. Server-side
 * discovery uses the service role and bypasses RLS.
 *
 * Not a 'use server' module: Next.js only permits async function exports
 * from those, and this file exports types too.
 */
import { createHash } from 'node:crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { POI_PHOTO_BUCKET, type PoiEntityScope } from './entity-scope';
import {
  DEFAULT_INCLUDED_TYPES,
  type PhotoBlob,
  type PlaceResult,
  bucketByPlaceType,
  fetchPhotoBinary,
  haversineMeters,
  searchNearby,
} from './google-places';
import type { IntentBucket, PhotoStatus, PoiStatus } from './types';

/**
 * Table names come from the scope descriptor at runtime, so the generated
 * per-table types cannot be selected statically. Each call site annotates the
 * row shape it expects. Confined to this module.
 */
type DynamicClient = {
  // biome-ignore lint/suspicious/noExplicitAny: table name is a runtime value; row shapes are annotated per call site
  from: (table: string) => any;
  // biome-ignore lint/suspicious/noExplicitAny: supabase storage surface
  storage: any;
};

export type EntityAnchor = {
  id: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
};

export type DiscoverResult = {
  discovered: number;
  reused: number;
  buckets: Partial<Record<IntentBucket, number>>;
};

export type PhotoFetchResult = {
  fetched: number;
  reused: number;
  skipped: number;
  skippedReasons?: string[];
};

export type NearbyPoi = {
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

async function requireEntity(s: PoiEntityScope, entityId: string): Promise<EntityAnchor> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error('not authenticated');

  const { data: row, error } = (await (supabase as unknown as DynamicClient)
    .from(s.entityTable)
    .select(`id, ${s.labelColumn}, lat, lng`)
    .eq('id', entityId)
    .maybeSingle()) as {
    data: (Record<string, string | null> & { lat: number | null; lng: number | null }) | null;
    error: unknown;
  };

  if (error) throw error;
  if (!row) throw new Error(s.anchorNotFound(entityId));
  return { id: entityId, label: row[s.labelColumn] ?? null, lat: row.lat, lng: row.lng };
}

// ─── discovery ──────────────────────────────────────────────────────────────

/**
 * Fetch nearby POIs from Google Places, upsert `pois`, insert the per-scope
 * join rows. Requires the entity to have lat/lng. Default radius 3km —
 * dynamic-radius policy (10-min drive) is deferred, see 2026-07-16.
 */
export async function discoverPois(
  s: PoiEntityScope,
  entityId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<DiscoverResult> {
  const entity = await requireEntity(s, entityId);
  if (entity.lat == null || entity.lng == null) {
    throw new Error(s.missingLatLng(entity.label ?? entityId));
  }

  const center = { lat: Number(entity.lat), lng: Number(entity.lng) };
  const radius = opts.radiusMeters ?? 3000;
  const admin = createServiceClient() as unknown as DynamicClient;

  const buckets: Partial<Record<IntentBucket, number>> = {};

  const categoryResults = await Promise.all(
    (opts.includedTypes ?? DEFAULT_INCLUDED_TYPES).map((t) =>
      searchNearby({ center, radius, includedTypes: [t], maxResultCount: 20 }).catch((err) => {
        console.error(`${s.logPrefix} searchNearby(${t}) failed:`, err);
        return [] as PlaceResult[];
      }),
    ),
  );

  const dedup = new Map<string, PlaceResult>();
  for (const p of categoryResults.flat()) if (p.id && !dedup.has(p.id)) dedup.set(p.id, p);

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
      console.error(`${s.logPrefix} upsert pois failed for ${place.id}:`, upsertErr);
      continue;
    }

    const dMeters = Math.round(
      haversineMeters(center, { lat: place.location.latitude, lng: place.location.longitude }),
    );
    const bucket = bucketByPlaceType(place.primaryType, place.types) as IntentBucket | null;
    if (!bucket) continue;

    const { data: existing } = (await admin
      .from(s.poiTable)
      .select(s.idColumn)
      .eq(s.idColumn, entityId)
      .eq('poi_id', poiRow.id)
      .maybeSingle()) as { data: Record<string, string> | null };

    if (existing) {
      reused += 1;
    } else {
      const { error: joinErr } = await admin.from(s.poiTable).insert({
        [s.idColumn]: entityId,
        poi_id: poiRow.id,
        intent_bucket: bucket,
        distance_m: dMeters,
        status: 'candidate',
      });
      if (joinErr) {
        console.error(`${s.logPrefix} insert ${s.poiTable} failed:`, joinErr);
        continue;
      }
      discovered += 1;
    }

    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }

  revalidatePath(s.revalidatePathFor(entityId));
  return { discovered, reused, buckets };
}

// ─── photo fetch ────────────────────────────────────────────────────────────

export async function fetchPhotosForPoi(
  s: PoiEntityScope,
  entityId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<PhotoFetchResult> {
  await requireEntity(s, entityId);
  const admin = createServiceClient() as unknown as DynamicClient;
  const result = await fetchPhotosForPoiWithClient(s, entityId, poiId, admin, opts);
  revalidatePath(s.revalidatePathFor(entityId));
  return result;
}

/**
 * Background-pipeline entry point. The caller must supply its already-created
 * service client; unlike the server action above this neither reads cookies
 * nor revalidates a request path, so workers and audited CLI runs can execute
 * the same photo implementation without weakening browser authentication.
 */
export async function fetchPhotosForPoiAsService(
  s: PoiEntityScope,
  entityId: string,
  poiId: string,
  adminClient: unknown,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<PhotoFetchResult> {
  return fetchPhotosForPoiWithClient(s, entityId, poiId, adminClient as DynamicClient, opts);
}

async function fetchPhotosForPoiWithClient(
  s: PoiEntityScope,
  entityId: string,
  poiId: string,
  admin: DynamicClient,
  opts: { max?: number; maxHeightPx?: number },
): Promise<PhotoFetchResult> {
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

  /** Ensure the per-scope review link exists for a stored photo. */
  const linkPhoto = async (poiPhotoId: string, onError?: (msg: string) => void) => {
    const { data: existingLink } = (await admin
      .from(s.photoJoinTable)
      .select(s.idColumn)
      .eq(s.idColumn, entityId)
      .eq('poi_photo_id', poiPhotoId)
      .maybeSingle()) as { data: Record<string, string> | null };
    if (existingLink) return;
    const { error: linkErr } = await admin.from(s.photoJoinTable).insert({
      [s.idColumn]: entityId,
      poi_photo_id: poiPhotoId,
      status: 'pending',
    });
    if (linkErr) {
      console.error(`${s.logPrefix} review link failed:`, linkErr);
      onError?.(`review link: ${(linkErr as { message?: string }).message ?? 'unknown'}`);
    }
  };

  // POI-level dedup (owner 2026-08-16): if this POI already has photos, just
  // link them — no re-download, no Google calls. Re-fetch is only meant to
  // backfill POIs that have none.
  const { data: existingAny } = (await admin
    .from('poi_photos')
    .select('id')
    .eq('poi_id', poi.id)
    .limit(1)) as { data: { id: string }[] | null };

  if ((existingAny ?? []).length > 0) {
    const refs = targets.map((p) => p.name).filter(Boolean);
    const { data: storedRows } = (await admin
      .from('poi_photos')
      .select('id, google_photo_name')
      .eq('poi_id', poi.id)
      .in('google_photo_name', refs)) as {
      data: Array<{ id: string; google_photo_name: string | null }> | null;
    };
    for (const row of storedRows ?? []) await linkPhoto(row.id);
    reused += (storedRows ?? []).length;
    return { fetched, reused, skipped, ...(skippedReasons.length ? { skippedReasons } : {}) };
  }

  for (const photo of targets) {
    // Google photo refs rotate on every Places response — the same image can
    // arrive under a different google_photo_name. Dedup by CONTENT HASH
    // (poi_id, content_hash), not by ref. Check ref first (cheap, common
    // case), then hash (catches rotated refs).
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
      let blob: PhotoBlob;
      try {
        blob = await fetchPhotoBinary(
          photo.name,
          opts.maxHeightPx ? { maxHeightPx: opts.maxHeightPx } : {},
        );
      } catch (err) {
        console.error(`${s.logPrefix} fetch photo ${photo.name} failed:`, err);
        noteSkip(`Google Places fetch: ${(err as Error).message ?? 'unknown'}`);
        continue;
      }

      const contentHash = createHash('sha256').update(blob.bytes).digest('hex');
      // Rotated ref for an image we already stored → reuse that row.
      const { data: existingByHash } = (await admin
        .from('poi_photos')
        .select('id')
        .eq('poi_id', poi.id)
        .eq('content_hash', contentHash)
        .maybeSingle()) as { data: { id: string } | null };
      if (existingByHash) {
        poiPhotoId = existingByHash.id;
        reused += 1;
        // Keep the row's google_photo_name fresh (new ref), cheap update.
        await admin
          .from('poi_photos')
          .update({ google_photo_name: photo.name, updated_at: new Date().toISOString() })
          .eq('id', poiPhotoId);
        continue;
      }

      const storagePath = `poi/${poi.id}/${hashName(photo.name)}.jpg`;
      const { error: upErr } = await admin.storage
        .from(POI_PHOTO_BUCKET)
        .upload(storagePath, blob.bytes, { contentType: blob.contentType, upsert: true });
      if (upErr) {
        console.error(`${s.logPrefix} storage upload failed:`, upErr);
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
            content_hash: contentHash,
            width_px: photo.widthPx ?? null,
            height_px: photo.heightPx ?? null,
            bytes: blob.bytes.length,
            attribution: { authorAttributions: photo.authorAttributions ?? [] },
          },
          { onConflict: 'google_photo_name' },
        )
        .select('id, created_at')
        .single()) as { data: { id: string; created_at: string } | null; error: unknown };

      if (upsertErr || !upserted) {
        console.error(`${s.logPrefix} upsert poi_photos failed:`, upsertErr);
        noteSkip(`DB upsert: ${(upsertErr as { message?: string })?.message ?? 'unknown'}`);
        continue;
      }
      poiPhotoId = upserted.id;
      const ageMs = Date.now() - new Date(upserted.created_at).getTime();
      if (ageMs < 5_000) fetched += 1;
      else reused += 1;
    }

    await linkPhoto(poiPhotoId, noteSkip);
  }

  return { fetched, reused, skipped, ...(skippedReasons.length ? { skippedReasons } : {}) };
}

// ─── review actions ─────────────────────────────────────────────────────────

export async function setPoiStatus(
  s: PoiEntityScope,
  entityId: string,
  poiId: string,
  status: PoiStatus,
) {
  await requireEntity(s, entityId);
  const supabase = (await createClient()) as unknown as DynamicClient;

  const { error } = await supabase
    .from(s.poiTable)
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq(s.idColumn, entityId)
    .eq('poi_id', poiId);
  if (error) throw error;

  revalidatePath(s.revalidatePathFor(entityId));
}

export async function setPhotoStatus(
  s: PoiEntityScope,
  entityId: string,
  poiPhotoId: string,
  status: PhotoStatus,
) {
  await requireEntity(s, entityId);
  const supabase = (await createClient()) as unknown as DynamicClient;

  const { error } = await supabase
    .from(s.photoJoinTable)
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq(s.idColumn, entityId)
    .eq('poi_photo_id', poiPhotoId);
  if (error) throw error;

  revalidatePath(s.revalidatePathFor(entityId));

  // Fire-and-forget vision tagging on approve.
  if (status === 'approved') {
    import('@/lib/poi/vision-tagger')
      .then(({ tagPoiPhoto }) => tagPoiPhoto(poiPhotoId))
      .catch((err) => console.error(`${s.logPrefix} vision tag dispatch failed:`, err));
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

export async function loadNearbyPois(s: PoiEntityScope, entityId: string): Promise<NearbyPoi[]> {
  // Admin bypass: /admin/pipeline/<scope>-nearby/[id] is reachable by any
  // is_admin=true agent, but the join table's SELECT policy scopes rows to
  // the owning agent. Without a bypass the panel loads empty and the
  // reviewer can't pick photos. See DEVLOG 2026-07-17.
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: agent } = (await (userClient as unknown as DynamicClient)
    .from('agents')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { is_admin: boolean } | null };

  const isAdmin = !!agent?.is_admin;
  if (!isAdmin) await requireEntity(s, entityId);

  const supabase = (isAdmin ? createServiceClient() : userClient) as unknown as DynamicClient;

  const { data: rows, error } = (await supabase
    .from(s.poiTable)
    .select(
      `
      poi_id, intent_bucket, distance_m, status, ai_score, discovered_at, reviewed_at,
      pois!inner(id, display_name, formatted_address, primary_type, rating, user_ratings_total)
    `,
    )
    .eq(s.idColumn, entityId)
    .order('distance_m', { ascending: true })) as {
    data: Array<Omit<NearbyPoi, 'photos'>> | null;
    error: unknown;
  };

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: photoRows, error: photoErr } = (await supabase
    .from(s.photoJoinTable)
    .select(
      `
      status, poi_photo_id,
      poi_photos!inner(poi_id, storage_path, attribution, ai_tags, tagged_at)
    `,
    )
    .eq(s.idColumn, entityId)) as {
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

  const photosByPoi = new Map<string, NearbyPoi['photos']>();
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

  return rows.map((r) => ({ ...r, photos: photosByPoi.get(r.poi_id) ?? [] }));
}

// ─── util ──────────────────────────────────────────────────────────────────

/** Short stable filename component. Not cryptographic. */
export function hashName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}
