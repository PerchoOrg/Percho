"use server";

/**
 * Phase 76.6 (2026-07-14): buyer-question bucket video generation.
 *
 * Design: docs/poi-content-pipeline.md §1.1 — ≤6 videos per listing, one per
 * buyer question. Never one video per POI.
 *
 * This module owns the server-side entry point: `generateBucketVideo(listingId,
 * bucket)` inserts a `generated_videos` row with `scope='intent_bucket'` and
 * `status='pending'`. The EC2 render worker (scripts/render-worker/) polls
 * `generated_videos where status='pending' and scope='intent_bucket'`, pulls
 * the referenced `input_photo_ids`, stitches a Ken Burns MP4, uploads to
 * Cloudflare Stream, and flips the row to `status='ready'`.
 *
 * The server action DOES NOT trigger rendering directly — it only enqueues.
 * The worker owns rendering because ffmpeg + CF Stream upload is minutes-long
 * and does not fit inside a Vercel function timeout.
 */

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { IntentBucket } from "./types";

// Rendering-pipeline sanity caps. Kept aligned with §5.3 of the design doc:
// a bucket video should be a tight 30–60s clip, not a slideshow of everything.
const MAX_PHOTOS_PER_VIDEO = 24; // ≈ 60s @ 2.5s per photo
const MIN_PHOTOS_PER_VIDEO = 3;  // < 3 approved photos = not enough narrative

export type GenerateBucketVideoResult =
  | {
      ok: true;
      video_id: string;
      photo_count: number;
      status: "pending" | "processing";
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "listing_not_found"
        | "not_enough_photos"
        | "already_in_progress"
        | "internal_error";
      message: string;
      approved_count?: number;
    };

/**
 * Enqueue a buyer-question video for a listing/bucket.
 *
 * Photo selection: all `listing_poi_photos.status='approved'` whose POI is
 * `listing_pois.intent_bucket = <bucket>` AND `listing_pois.status='approved'`.
 *
 * Idempotency: if a `generated_videos` row already exists for this
 * (listing_id, intent_bucket) in a non-terminal status (pending/processing),
 * we return `already_in_progress` instead of enqueueing a second render. If
 * the existing row is `ready`/`approved`/`rejected`/`failed`, we allow a new
 * render (user is explicitly regenerating).
 */
export async function generateBucketVideo(
  listingId: string,
  bucket: IntentBucket,
): Promise<GenerateBucketVideoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: "unauthorized", message: "Not signed in." };
  }

  // Verify the caller owns this listing (RLS on `listings` handles the read;
  // we surface a clean error if the join returns nothing).
  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) {
    return {
      ok: false,
      reason: "listing_not_found",
      message: "Listing not found or you don't have access.",
    };
  }

  const admin = createServiceClient();

  // Pull approved photos for this listing/bucket. We embed via listing_pois to
  // filter by intent_bucket + POI-level approval; then join poi_photos for
  // storage_path/attribution the renderer needs.
  //
  // PostgREST NOTE: embed traversal only follows direct FKs. `listing_poi_photos`
  // has FKs to `listings` and `poi_photos`, not directly to `listing_pois`, so
  // we fetch approved photos then filter by bucket in a second pass. See
  // memory §postgrest-embed-shared-key-trap.
  const { data: approvedPhotos, error: photosErr } = (await admin
    .from("listing_poi_photos")
    .select(
      "poi_photo_id, poi_photos!inner(id, poi_id, storage_path, attribution, width_px, height_px)",
    )
    .eq("listing_id", listingId)
    .eq("status", "approved")) as {
    data:
      | Array<{
          poi_photo_id: string;
          poi_photos: {
            id: string;
            poi_id: string;
            storage_path: string;
            attribution: unknown;
            width_px: number | null;
            height_px: number | null;
          };
        }>
      | null;
    error: { message: string } | null;
  };

  if (photosErr) {
    console.error("[bucket-video] approved photos query failed:", photosErr);
    return {
      ok: false,
      reason: "internal_error",
      message: `Photo query failed: ${photosErr.message}`,
    };
  }

  const photoRows = approvedPhotos ?? [];

  if (photoRows.length === 0) {
    return {
      ok: false,
      reason: "not_enough_photos",
      message: `No approved photos yet. Approve photos in the ${bucketLabel(bucket)} bucket first.`,
      approved_count: 0,
    };
  }

  // Filter by bucket: pull listing_pois for these POI ids, keep only matching.
  const poiIds = Array.from(new Set(photoRows.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois, error: bucketErr } = (await admin
    .from("listing_pois")
    .select("poi_id, intent_bucket, status")
    .eq("listing_id", listingId)
    .eq("intent_bucket", bucket)
    .eq("status", "approved")
    .in("poi_id", poiIds)) as {
    data: Array<{ poi_id: string; intent_bucket: string; status: string }> | null;
    error: { message: string } | null;
  };

  if (bucketErr) {
    console.error("[bucket-video] listing_pois query failed:", bucketErr);
    return {
      ok: false,
      reason: "internal_error",
      message: `Bucket query failed: ${bucketErr.message}`,
    };
  }

  const bucketPoiSet = new Set((bucketPois ?? []).map((p) => p.poi_id));
  const bucketPhotos = photoRows.filter((r) => bucketPoiSet.has(r.poi_photos.poi_id));

  if (bucketPhotos.length < MIN_PHOTOS_PER_VIDEO) {
    return {
      ok: false,
      reason: "not_enough_photos",
      message: `Need at least ${MIN_PHOTOS_PER_VIDEO} approved photos in the ${bucketLabel(bucket)} bucket — you have ${bucketPhotos.length}.`,
      approved_count: bucketPhotos.length,
    };
  }

  // Cap to keep video length sane. Rank ordering is v0: insertion order, i.e.
  // whichever photos the agent approved first. v1 will use ai_score from
  // poi_photos.ai_tags.usable / ai_score.
  const selected = bucketPhotos.slice(0, MAX_PHOTOS_PER_VIDEO);
  const inputPhotoIds = selected.map((r) => r.poi_photo_id);

  // Idempotency: refuse to enqueue a second concurrent render for the same
  // (listing, bucket). A user-driven regenerate on a terminal row is fine.
  const { data: inflight } = (await admin
    .from("generated_videos")
    .select("id, status")
    .eq("listing_id", listingId)
    .eq("scope", "intent_bucket")
    .eq("intent_bucket", bucket)
    .in("status", ["pending", "processing"])
    .maybeSingle()) as { data: { id: string; status: string } | null };

  if (inflight) {
    return {
      ok: false,
      reason: "already_in_progress",
      message: `A ${bucketLabel(bucket)} video is already being generated (status: ${inflight.status}).`,
    };
  }

  const { data: inserted, error: insErr } = (await admin
    .from("generated_videos")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      listing_id: listingId,
      scope: "intent_bucket",
      intent_bucket: bucket,
      input_photo_ids: inputPhotoIds,
      generator: "ffmpeg_slideshow",
      status: "pending",
      aspect_ratio: "9:16",
      narrative: {
        source: "manual_trigger",
        selected_at: new Date().toISOString(),
        photo_count: selected.length,
        bucket,
      },
    } as never)
    .select("id, status")
    .single()) as {
    data: { id: string; status: string } | null;
    error: { message: string } | null;
  };

  if (insErr || !inserted) {
    console.error("[bucket-video] insert generated_videos failed:", insErr);
    return {
      ok: false,
      reason: "internal_error",
      message: `Enqueue failed: ${insErr?.message ?? "unknown"}`,
    };
  }

  revalidatePath(`/dashboard/listings/${listingId}/edit`);

  return {
    ok: true,
    video_id: inserted.id,
    photo_count: selected.length,
    status: inserted.status as "pending" | "processing",
  };
}

function bucketLabel(bucket: IntentBucket): string {
  switch (bucket) {
    case "walkable":
      return "Walkable";
    case "daily_drive":
      return "Daily drive";
    case "lifestyle":
      return "Lifestyle";
    case "commute":
      return "Commute";
  }
}

/**
 * Latest bucket-video row for (listing, bucket). Client polls this while a
 * render is in flight. Returns null when no row has ever been created.
 */
export type BucketVideoStatus = {
  video_id: string;
  status: "pending" | "processing" | "ready" | "approved" | "rejected" | "failed";
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
} | null;

export async function getBucketVideoStatus(
  listingId: string,
  bucket: IntentBucket,
): Promise<BucketVideoStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS on `generated_videos` enforces agent ownership via listing_id → listings → agents.
  const { data } = (await supabase
    .from("generated_videos")
    .select("id, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at")
    .eq("listing_id", listingId)
    .eq("scope", "intent_bucket")
    .eq("intent_bucket", bucket)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: {
      id: string;
      status: string;
      cf_stream_uid: string | null;
      duration_s: number | null;
      input_photo_ids: string[] | null;
      error: string | null;
      created_at: string;
    } | null;
  };

  if (!data) return null;
  return {
    video_id: data.id,
    status: data.status as NonNullable<BucketVideoStatus>["status"],
    cf_stream_uid: data.cf_stream_uid,
    duration_s: data.duration_s,
    photo_count: data.input_photo_ids?.length ?? 0,
    error: data.error,
    created_at: data.created_at,
  };
}
