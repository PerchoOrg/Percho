"use server";

/**
 * Phase 101 (2026-07-16) — listing-scoped POI content pipeline.
 *
 * Mirror of `lib/poi/community-actions.ts` (which itself mirrors the
 * pre-Phase-92 listing-scoped pipeline). Rationale: not every listing sits
 * inside a curated community, but every listing must show nearby videos.
 * When a listing has no covering community, discovery anchors on the
 * listing itself and populates `listing_pois` / `listing_poi_photos`.
 *
 * POIs and their photos remain GLOBAL — the `pois` and `poi_photos` tables
 * are keyed on google_place_id / google_photo_name and shared across
 * listings AND communities. Only the join rows (`listing_pois`) duplicate.
 *
 * Auth model: listing_pois is OWNER-SCOPED (listings→agents chain). Any
 * authenticated caller must own the listing to read/write. Server-side
 * discovery uses the service role and bypasses RLS.
 */

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_INCLUDED_TYPES,
  bucketByPlaceType,
  fetchPhotoBinary,
  haversineMeters,
  searchNearby,
  type PlaceResult,
} from "./google-places";
import type { IntentBucket, PhotoStatus, PoiStatus } from "./types";

const POI_PHOTO_BUCKET = "listing-photos";

type ListingAnchor = {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

async function requireOwnedListing(listingId: string): Promise<ListingAnchor> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("not authenticated");

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabaseAny: any = supabase;
  const { data: listing, error } = (await supabaseAny
    .from("listings")
    .select("id, address, lat, lng")
    .eq("id", listingId)
    .maybeSingle()) as { data: ListingAnchor | null; error: unknown };

  if (error) throw error;
  if (!listing) throw new Error(`listing ${listingId} not found or not owned`);
  return listing;
}

// ─── discovery ──────────────────────────────────────────────────────────────

export type ListingDiscoverResult = {
  discovered: number;
  reused: number;
  buckets: Partial<Record<IntentBucket, number>>;
};

/**
 * Fetch nearby POIs from Google Places, upsert `pois`, insert `listing_pois`
 * scoped to this listing. Requires the listing to have lat/lng. Default
 * radius mirrors the community-scoped default (3km) — dynamic-radius policy
 * (10-min drive) is deferred, see 2026-07-16 conversation.
 */
export async function discoverPoisForListing(
  listingId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<ListingDiscoverResult> {
  const listing = await requireOwnedListing(listingId);
  if (listing.lat == null || listing.lng == null) {
    throw new Error(
      `listing "${listing.address ?? listingId}" has no lat/lng — geocode before running discovery`,
    );
  }

  const center = { lat: Number(listing.lat), lng: Number(listing.lng) };
  const radius = opts.radiusMeters ?? 3000;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const buckets: Partial<Record<IntentBucket, number>> = {};

  const categoryResults = await Promise.all(
    (opts.includedTypes ?? DEFAULT_INCLUDED_TYPES).map((t) =>
      searchNearby({ center, radius, includedTypes: [t], maxResultCount: 20 }).catch(
        (err) => {
          console.error(`[listing-poi] searchNearby(${t}) failed:`, err);
          return [] as PlaceResult[];
        },
      ),
    ),
  );
  const allPlaces = categoryResults.flat();

  const dedup = new Map<string, PlaceResult>();
  for (const p of allPlaces) if (p.id && !dedup.has(p.id)) dedup.set(p.id, p);

  let discovered = 0;
  let reused = 0;

  for (const place of dedup.values()) {
    if (!place.location) continue;

    const { data: poiRow, error: upsertErr } = (await admin
      .from("pois")
      .upsert(
        {
          google_place_id: place.id,
          display_name: place.displayName?.text ?? "(unnamed)",
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
        { onConflict: "google_place_id" },
      )
      .select("id")
      .single()) as { data: { id: string } | null; error: unknown };

    if (upsertErr || !poiRow) {
      console.error(`[listing-poi] upsert pois failed for ${place.id}:`, upsertErr);
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
      .from("listing_pois")
      .select("listing_id")
      .eq("listing_id", listingId)
      .eq("poi_id", poiRow.id)
      .maybeSingle()) as { data: { listing_id: string } | null };

    if (existing) {
      reused += 1;
    } else {
      const { error: lpErr } = await admin.from("listing_pois").insert({
        listing_id: listingId,
        poi_id: poiRow.id,
        intent_bucket: bucket,
        distance_m: dMeters,
        status: "candidate",
      });
      if (lpErr) {
        console.error(`[listing-poi] insert listing_pois failed:`, lpErr);
        continue;
      }
      discovered += 1;
    }

    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
  return { discovered, reused, buckets };
}

// ─── photo fetch ────────────────────────────────────────────────────────────

export type ListingPhotoFetchResult = {
  fetched: number;
  reused: number;
  skipped: number;
  skippedReasons?: string[];
};

export async function fetchPhotosForListingPoi(
  listingId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<ListingPhotoFetchResult> {
  await requireOwnedListing(listingId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const { data: poi, error: poiErr } = (await admin
    .from("pois")
    .select("id, google_place_id, raw_place")
    .eq("id", poiId)
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
      .from("poi_photos")
      .select("id")
      .eq("google_photo_name", photo.name)
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
        console.error(`[listing-poi] fetch photo ${photo.name} failed:`, err);
        noteSkip(`Google Places fetch: ${(err as Error).message ?? "unknown"}`);
        continue;
      }

      const storagePath = `poi/${poi.id}/${hashName(photo.name)}.jpg`;
      const { error: upErr } = await admin.storage
        .from(POI_PHOTO_BUCKET)
        .upload(storagePath, blob.bytes, { contentType: blob.contentType, upsert: true });
      if (upErr) {
        console.error(`[listing-poi] storage upload failed:`, upErr);
        noteSkip(`Storage upload: ${(upErr as { message?: string }).message ?? "unknown"}`);
        continue;
      }

      const { data: upserted, error: upsertErr } = (await admin
        .from("poi_photos")
        .upsert(
          {
            poi_id: poi.id,
            source: "google_places",
            google_photo_name: photo.name,
            storage_path: storagePath,
            width_px: photo.widthPx ?? null,
            height_px: photo.heightPx ?? null,
            bytes: blob.bytes.length,
            attribution: { authorAttributions: photo.authorAttributions ?? [] },
          },
          { onConflict: "google_photo_name" },
        )
        .select("id, created_at")
        .single()) as {
        data: { id: string; created_at: string } | null;
        error: unknown;
      };

      if (upsertErr || !upserted) {
        console.error(`[listing-poi] upsert poi_photos failed:`, upsertErr);
        noteSkip(`DB upsert: ${(upsertErr as { message?: string })?.message ?? "unknown"}`);
        continue;
      }
      poiPhotoId = upserted.id;
      const ageMs = Date.now() - new Date(upserted.created_at).getTime();
      if (ageMs < 5_000) fetched += 1;
      else reused += 1;
    }

    const { data: existingLink } = (await admin
      .from("listing_poi_photos")
      .select("listing_id")
      .eq("listing_id", listingId)
      .eq("poi_photo_id", poiPhotoId)
      .maybeSingle()) as { data: { listing_id: string } | null };

    if (!existingLink) {
      await admin.from("listing_poi_photos").insert({
        listing_id: listingId,
        poi_photo_id: poiPhotoId,
        status: "pending",
      });
    }
  }

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
  return { fetched, reused, skipped, ...(skippedReasons.length ? { skippedReasons } : {}) };
}

// ─── review actions ─────────────────────────────────────────────────────────

export async function setListingPoiStatus(
  listingId: string,
  poiId: string,
  status: PoiStatus,
) {
  await requireOwnedListing(listingId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  const { error } = await supabase
    .from("listing_pois")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("listing_id", listingId)
    .eq("poi_id", poiId);
  if (error) throw error;

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
}

export async function setListingPhotoStatus(
  listingId: string,
  poiPhotoId: string,
  status: PhotoStatus,
) {
  await requireOwnedListing(listingId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  const { error } = await supabase
    .from("listing_poi_photos")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("listing_id", listingId)
    .eq("poi_photo_id", poiPhotoId);
  if (error) throw error;

  revalidatePath(`/dashboard/listings/${listingId}/edit`);

  // Fire-and-forget vision tagging on approve — same pattern as community side.
  if (status === "approved") {
    import("@/lib/poi/vision-tagger")
      .then(({ tagPoiPhoto }) => tagPoiPhoto(poiPhotoId))
      .catch((err) => console.error("[listing-poi] vision tag dispatch failed:", err));
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

export type NearbyPoiForListing = {
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

export async function loadNearbyPoisForListing(
  listingId: string,
): Promise<NearbyPoiForListing[]> {
  await requireOwnedListing(listingId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  const { data: rows, error } = (await supabase
    .from("listing_pois")
    .select(
      `
      poi_id, intent_bucket, distance_m, status, ai_score, discovered_at, reviewed_at,
      pois!inner(id, display_name, formatted_address, primary_type, rating, user_ratings_total)
    `,
    )
    .eq("listing_id", listingId)
    .order("distance_m", { ascending: true })) as {
    data: Array<Omit<NearbyPoiForListing, "photos">> | null;
    error: unknown;
  };

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: photoRows, error: photoErr } = (await supabase
    .from("listing_poi_photos")
    .select(
      `
      status, poi_photo_id,
      poi_photos!inner(poi_id, storage_path, attribution, ai_tags, tagged_at)
    `,
    )
    .eq("listing_id", listingId)) as {
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

  const photosByPoi = new Map<string, NearbyPoiForListing["photos"]>();
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
  return (h >>> 0).toString(16).padStart(8, "0");
}
