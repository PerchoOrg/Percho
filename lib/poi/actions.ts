"use server";

/**
 * POI content pipeline — server actions for the Media tab.
 *
 * Phase 76 (2026-07-14). See docs/poi-content-pipeline.md.
 *
 * Split by responsibility:
 *   discoverPoisForListing   — hit searchNearby, upsert pois + listing_pois
 *   fetchPhotosForPoi        — pull up to N photos, upload to Supabase Storage,
 *                              upsert poi_photos + listing_poi_photos
 *   setListingPoiStatus      — approve/reject a POI for this listing
 *   setListingPhotoStatus    — approve/reject a photo for this listing
 *   logReviewEvent           — write to review_events (training data)
 *
 * All actions require the caller to own the listing (`listings.agent_id ->
 * agents.user_id === auth.uid()`). Photo/POI fetch uses the service-role
 * client because we're writing to the global tables that clients can't touch
 * directly under RLS.
 *
 * Types note: `lib/supabase/database.types.ts` is a stub, so we cast the
 * client to `any` for all queries — matches the existing project convention
 * (see app/_actions/saved-listings.ts).
 */

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  bucketByDistance,
  DEFAULT_INCLUDED_TYPES,
  fetchPhotoBinary,
  haversineMeters,
  searchNearby,
  type PlaceResult,
} from "./google-places";
import type { IntentBucket, PhotoStatus, PoiStatus, ReviewAction } from "./types";

const POI_PHOTO_BUCKET = "listing-photos"; // reuse existing listing photo bucket; poi/ path prefix distinguishes

type ListingRow = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  agent_id: string;
  agents: { user_id: string } | { user_id: string }[];
};

/** Verify the caller owns this listing. Throws on mismatch. Returns listing row. */
async function requireOwnedListing(listingId: string): Promise<ListingRow> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("not authenticated");

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing, error } = (await (supabase as any)
    .from("listings")
    .select("id, address, lat, lng, agent_id, agents!inner(user_id)")
    .eq("id", listingId)
    .single()) as { data: ListingRow | null; error: unknown };

  if (error || !listing) throw new Error(`listing ${listingId} not found`);
  const agent = Array.isArray(listing.agents) ? listing.agents[0] : listing.agents;
  if (!agent || agent.user_id !== user.user.id) throw new Error("not authorized for this listing");
  return listing;
}

// ─── discovery ──────────────────────────────────────────────────────────────

export type DiscoverResult = {
  discovered: number;
  reused: number;
  buckets: Record<IntentBucket, number>;
};

/**
 * Fetch nearby POIs for a listing. Upserts into the global `pois` table
 * (dedup by google_place_id) and registers `listing_pois` rows scoped to
 * this listing. Existing `listing_pois` (previously reviewed) are left alone
 * — this is idempotent.
 *
 * Phase A: pulls up to 20 POIs per default category (6 categories = 120
 * candidates max), buckets by straight-line distance. Phase B replaces
 * straight-line with driving time.
 */
export async function discoverPoisForListing(
  listingId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<DiscoverResult> {
  const listing = await requireOwnedListing(listingId);
  if (listing.lat == null || listing.lng == null) {
    throw new Error("listing has no lat/lng — geocode it before discovering POIs");
  }

  const center = { lat: Number(listing.lat), lng: Number(listing.lng) };
  const radius = opts.radiusMeters ?? 8046; // 5 miles default (§2 of doc)
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const buckets: Record<IntentBucket, number> = {
    walkable: 0,
    daily_drive: 0,
    lifestyle: 0,
    commute: 0,
  };

  // Fan out one search per category — Google's searchNearby caps includedTypes
  // to a homogeneous request, and mixing all six in one call biases toward the
  // over-represented category (usually restaurants). Six parallel calls =
  // $0.032 × 6 = $0.19 per discover, well within §6 budget.
  const categoryResults = await Promise.all(
    (opts.includedTypes ?? DEFAULT_INCLUDED_TYPES).map((t) =>
      searchNearby({ center, radius, includedTypes: [t], maxResultCount: 20 }).catch(
        (err) => {
          console.error(`[poi] searchNearby(${t}) failed:`, err);
          return [] as PlaceResult[];
        },
      ),
    ),
  );
  const allPlaces = categoryResults.flat();

  // Dedup by place id across categories (a place can appear in multiple types).
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
      .select("id, discovered_at")
      .single()) as { data: { id: string; discovered_at: string } | null; error: unknown };

    if (upsertErr || !poiRow) {
      console.error(`[poi] upsert pois failed for ${place.id}:`, upsertErr);
      continue;
    }

    const dMeters = Math.round(
      haversineMeters(center, {
        lat: place.location.latitude,
        lng: place.location.longitude,
      }),
    );
    const bucket = bucketByDistance(dMeters);

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
        console.error(`[poi] insert listing_pois failed:`, lpErr);
        continue;
      }
      discovered += 1;
    }

    buckets[bucket] += 1;
  }

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
  return { discovered, reused, buckets };
}

// ─── photo fetch ────────────────────────────────────────────────────────────

export type PhotoFetchResult = {
  fetched: number;
  reused: number;
  skipped: number;
  skippedReasons?: string[]; // human-readable, first few failures for UI display
};

/**
 * Pull up to `max` photos for a POI (default 10 = Google's per-place cap).
 * Uploads each to Supabase Storage, upserts `poi_photos` (dedup by
 * google_photo_name), and inserts `listing_poi_photos` rows so the listing's
 * media tab shows them in pending state.
 *
 * Idempotent: re-running for the same POI won't re-download photos already
 * in `poi_photos`, but *will* insert missing `listing_poi_photos` rows if
 * this listing hasn't seen them yet.
 */
export async function fetchPhotosForPoi(
  listingId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<PhotoFetchResult> {
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
    const { data: existingPhoto, error: lookupErr } = (await admin
      .from("poi_photos")
      .select("id")
      .eq("google_photo_name", photo.name)
      .maybeSingle()) as { data: { id: string } | null; error: unknown };

    if (lookupErr) {
      console.error(`[poi] poi_photos lookup for ${photo.name} errored:`, lookupErr);
    }

    let poiPhotoId: string;

    if (existingPhoto) {
      poiPhotoId = existingPhoto.id;
      reused += 1;
    } else {
      let blob;
      try {
        blob = await fetchPhotoBinary(photo.name, { maxHeightPx: opts.maxHeightPx ?? 1200 });
      } catch (err) {
        console.error(`[poi] fetch photo ${photo.name} failed:`, err);
        noteSkip(`Google Places fetch: ${(err as Error).message ?? "unknown"}`);
        continue;
      }

      const storagePath = `poi/${poi.id}/${hashName(photo.name)}.jpg`;
      const { error: upErr } = await admin.storage
        .from(POI_PHOTO_BUCKET)
        .upload(storagePath, blob.bytes, {
          contentType: blob.contentType,
          upsert: true,
        });
      if (upErr) {
        console.error(`[poi] storage upload failed:`, upErr);
        noteSkip(`Storage upload: ${(upErr as { message?: string }).message ?? "unknown"}`);
        continue;
      }

      // Upsert on google_photo_name (UNIQUE). If a concurrent request or a
      // silent lookup miss already inserted this row, we treat it as reused
      // instead of skipped — the storage blob is a harmless overwrite (upsert
      // above) and the row's `id` is what we need next.
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
        console.error(`[poi] upsert poi_photos failed:`, upsertErr, {
          photo_name: photo.name,
          storage_path: storagePath,
        });
        noteSkip(`DB upsert: ${(upsertErr as { message?: string })?.message ?? "unknown"}`);
        continue;
      }
      poiPhotoId = upserted.id;
      // If the row's created_at is within the last few seconds, we just
      // inserted it → count as fetched. Otherwise the upsert hit an existing
      // row (the earlier lookup was a false-null) → count as reused.
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
  reason: {
    reasonTags?: string[];
    note?: string;
    aiPrediction?: Record<string, unknown> | null;
  } = {},
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

  await logReviewEvent({
    listingId,
    entityType: "listing_poi",
    entityRef: { poi_id: poiId },
    action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "comment",
    reasonTags: reason.reasonTags,
    humanNote: reason.note,
    aiPrediction: reason.aiPrediction,
  });

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
}

export async function setListingPhotoStatus(
  listingId: string,
  poiPhotoId: string,
  status: PhotoStatus,
  reason: {
    reasonTags?: string[];
    note?: string;
    aiPrediction?: Record<string, unknown> | null;
  } = {},
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

  await logReviewEvent({
    listingId,
    entityType: "listing_poi_photo",
    entityRef: { poi_photo_id: poiPhotoId },
    action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "comment",
    reasonTags: reason.reasonTags,
    humanNote: reason.note,
    aiPrediction: reason.aiPrediction,
  });

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
}

// ─── review event log (training data) ──────────────────────────────────────

export type LogReviewEventInput = {
  listingId: string;
  entityType: "listing_poi" | "listing_poi_photo" | "tag" | "narrative" | "video";
  entityRef: Record<string, unknown>;
  action: ReviewAction;
  reasonTags?: string[];
  humanNote?: string;
  aiPrediction?: Record<string, unknown> | null;
  humanValue?: Record<string, unknown> | null;
};

export async function logReviewEvent(input: LogReviewEventInput) {
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("not authenticated");

  const { error } = await supabase.from("review_events").insert({
    listing_id: input.listingId,
    entity_type: input.entityType,
    entity_ref: input.entityRef,
    action: input.action,
    reason_tags: input.reasonTags ?? null,
    human_note: input.humanNote ?? null,
    ai_prediction: input.aiPrediction ?? null,
    human_value: input.humanValue ?? null,
    reviewer_id: userRes.user.id,
  });

  if (error) {
    console.error("[poi] review_events insert failed:", error);
    // Non-fatal: don't block the user action if event logging fails.
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

export type NearbyPoiForListing = {
  poi_id: string;
  intent_bucket: IntentBucket;
  distance_m: number | null;
  drive_time_s: number | null;
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
    poi_photos: { storage_path: string; attribution: Record<string, unknown> | null };
  }>;
};

/**
 * Full snapshot for the Media tab's Nearby POI panel:
 *   - all listing_pois grouped by intent bucket
 *   - photos linked via listing_poi_photos → poi_photos, stitched in JS
 *
 * Two queries + client-side join instead of a PostgREST embed, because
 * `listing_pois` and `listing_poi_photos` share `listing_id`+`poi_id` (via
 * `poi_photos.poi_id`) but have no direct FK — PostgREST can't infer that
 * relationship and errors out with PGRST200. The two-query pattern is O(N)
 * with N ≤ ~120, so no perf concern.
 */
export async function loadNearbyPoisForListing(
  listingId: string,
): Promise<NearbyPoiForListing[]> {
  await requireOwnedListing(listingId);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = await createClient();

  // Query 1: listing_pois joined to the global pois row.
  const { data: rows, error } = (await supabase
    .from("listing_pois")
    .select(
      `
      poi_id, intent_bucket, distance_m, drive_time_s, status, ai_score, discovered_at, reviewed_at,
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

  // Query 2: photos for this listing, joined to their poi_photos (which
  // carries poi_id so we can group).
  const { data: photoRows, error: photoErr } = (await supabase
    .from("listing_poi_photos")
    .select(
      `
      status, poi_photo_id,
      poi_photos!inner(poi_id, storage_path, attribution)
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
      };
    }> | null;
    error: unknown;
  };

  if (photoErr) throw photoErr;

  // Bucket photos by poi_id for O(1) lookup while stitching.
  const photosByPoi = new Map<
    string,
    NearbyPoiForListing["photos"]
  >();
  for (const p of photoRows ?? []) {
    const poiId = p.poi_photos.poi_id;
    const list = photosByPoi.get(poiId) ?? [];
    list.push({
      status: p.status,
      poi_photo_id: p.poi_photo_id,
      poi_photos: {
        storage_path: p.poi_photos.storage_path,
        attribution: p.poi_photos.attribution,
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
  // Deterministic short hash for storage path — no crypto import needed.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}
