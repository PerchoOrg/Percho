"use server";

/**
 * Phase 101 (2026-07-16) — listing-scoped bucket video generation.
 *
 * Mirror of `lib/poi/community-video-actions.ts` but keyed on `listing_id`.
 * Used when a listing has no covering community — every listing must show
 * nearby videos, so discovery + video generation can anchor on the listing
 * directly. POI photos stay global (poi_photos table); only the join /
 * ownership rows are listing-scoped.
 *
 * Output: inserts a `generated_videos` row with
 *   scope='listing_intent_bucket', listing_id set, community_id null.
 * The EC2 render worker polls the same table (worker cutover in this same
 * phase — see scripts/render-worker/worker.py).
 *
 * "Multiple videos, one primary" policy inherited from Phase 91/92 — we do
 * not supersede previous ready rows. Cross-bucket photo dedup applies
 * against live rows for the SAME listing so we don't burn photos on a
 * bucket that's about to overwrite itself.
 */

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { IntentBucket } from "./types";

const MAX_PHOTOS_PER_VIDEO = 15;
const MIN_PHOTOS_PER_VIDEO = 3;

export type GenerateListingBucketVideoResult =
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

export async function generateListingBucketVideo(
  listingId: string,
  bucket: IntentBucket,
): Promise<GenerateListingBucketVideoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: "unauthorized", message: "Not signed in." };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabaseAny: any = supabase;
  const { data: listing } = (await supabaseAny
    .from("listings")
    .select("id, address")
    .eq("id", listingId)
    .maybeSingle()) as { data: { id: string; address: string | null } | null };
  if (!listing) {
    return {
      ok: false,
      reason: "listing_not_found",
      message: "Listing not found or not owned by you.",
    };
  }
  const listingLabel = listing.address ?? "this listing";

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  // Approved photos + POI bucket lookup — same shape as community side.
  const { data: approvedPhotos, error: photosErr } = (await admin
    .from("listing_poi_photos")
    .select(
      "poi_photo_id, poi_photos!inner(id, poi_id, storage_path, attribution, width_px, height_px, applicable_buckets, ai_score, tagged_at)",
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
            applicable_buckets: string[] | null;
            ai_score: number | null;
            tagged_at: string | null;
          };
        }>
      | null;
    error: { message: string } | null;
  };

  if (photosErr) {
    console.error("[listing-bucket-video] approved photos query failed:", photosErr);
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
      message: `No approved photos yet for ${listingLabel}. Approve photos in the ${bucketLabel(bucket)} bucket first.`,
      approved_count: 0,
    };
  }

  const poiIds = Array.from(new Set(photoRows.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois, error: bucketErr } = (await admin
    .from("listing_pois")
    .select("poi_id, intent_bucket, status, distance_m")
    .eq("listing_id", listingId)
    .eq("intent_bucket", bucket)
    .eq("status", "approved")
    .in("poi_id", poiIds)) as {
    data: Array<{
      poi_id: string;
      intent_bucket: string;
      status: string;
      distance_m: number | null;
    }> | null;
    error: { message: string } | null;
  };

  if (bucketErr) {
    console.error("[listing-bucket-video] listing_pois query failed:", bucketErr);
    return {
      ok: false,
      reason: "internal_error",
      message: `Bucket query failed: ${bucketErr.message}`,
    };
  }

  const bucketPoiSet = new Set((bucketPois ?? []).map((p) => p.poi_id));
  const distanceByPoi = new Map<string, number>(
    (bucketPois ?? [])
      .filter((p) => p.distance_m != null)
      .map((p) => [p.poi_id, p.distance_m as number]),
  );

  // Cross-bucket dedup within this listing — a photo used by another live
  // listing-scoped video is off-limits.
  const { data: liveVideos } = (await admin
    .from("generated_videos")
    .select("id, intent_bucket, input_photo_ids, status")
    .eq("listing_id", listingId)
    .eq("scope", "listing_intent_bucket")
    .neq("intent_bucket", bucket)
    .in("status", ["pending", "processing", "ready"])) as {
    data: Array<{
      id: string;
      intent_bucket: string;
      input_photo_ids: string[] | null;
      status: string;
    }> | null;
  };

  const claimedPhotoIds = new Set<string>();
  for (const v of liveVideos ?? []) {
    for (const pid of v.input_photo_ids ?? []) claimedPhotoIds.add(pid);
  }

  const eligible = photoRows.filter((r) => {
    if (claimedPhotoIds.has(r.poi_photo_id)) return false;
    const p = r.poi_photos;
    const applicable = Array.isArray(p.applicable_buckets) ? p.applicable_buckets : [];
    if (p.tagged_at && applicable.length > 0) {
      return applicable.includes(bucket);
    }
    return bucketPoiSet.has(p.poi_id);
  });

  if (eligible.length < MIN_PHOTOS_PER_VIDEO) {
    return {
      ok: false,
      reason: "not_enough_photos",
      message: `Need at least ${MIN_PHOTOS_PER_VIDEO} approved photos in the ${bucketLabel(bucket)} bucket for ${listingLabel} — you have ${eligible.length} available.`,
      approved_count: eligible.length,
    };
  }

  // Outer→inner walk-in ordering (same as community side).
  const isPortrait = (r: (typeof eligible)[number]) => {
    const w = r.poi_photos.width_px ?? 0;
    const h = r.poi_photos.height_px ?? 0;
    return h > w;
  };
  const scoreOf = (r: (typeof eligible)[number]) => r.poi_photos.ai_score ?? 0.5;

  const byPoi = new Map<string, typeof eligible>();
  for (const r of eligible) {
    const key = r.poi_photos.poi_id;
    const arr = byPoi.get(key) ?? [];
    arr.push(r);
    byPoi.set(key, arr);
  }
  for (const arr of byPoi.values()) {
    arr.sort((a, b) => {
      const pa = isPortrait(a) ? 0 : 1;
      const pb = isPortrait(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (scoreOf(a) !== scoreOf(b)) return scoreOf(b) - scoreOf(a);
      return a.poi_photo_id.localeCompare(b.poi_photo_id);
    });
  }

  const poiOrder = Array.from(byPoi.entries()).sort(([aId], [bId]) => {
    const da = distanceByPoi.get(aId);
    const db = distanceByPoi.get(bId);
    if (da != null && db != null) return db - da;
    if (da != null) return -1;
    if (db != null) return 1;
    return aId.localeCompare(bId);
  });

  const selected: typeof eligible = [];
  for (const [, arr] of poiOrder) {
    for (const photo of arr) {
      if (selected.length >= MAX_PHOTOS_PER_VIDEO) break;
      selected.push(photo);
    }
    if (selected.length >= MAX_PHOTOS_PER_VIDEO) break;
  }

  const inputPhotoIds = selected.map((r) => r.poi_photo_id);

  const { data: inflight } = (await admin
    .from("generated_videos")
    .select("id, status")
    .eq("listing_id", listingId)
    .eq("scope", "listing_intent_bucket")
    .eq("intent_bucket", bucket)
    .in("status", ["pending", "processing"])
    .maybeSingle()) as { data: { id: string; status: string } | null };

  if (inflight) {
    return {
      ok: false,
      reason: "already_in_progress",
      message: `A ${bucketLabel(bucket)} video for ${listingLabel} is already being generated (status: ${inflight.status}).`,
    };
  }

  const { data: inserted, error: insErr } = (await admin
    .from("generated_videos")
    .insert({
      listing_id: listingId,
      community_id: null,
      scope: "listing_intent_bucket",
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
    console.error("[listing-bucket-video] insert generated_videos failed:", insErr);
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
    case "schools": return "Schools";
    case "dining": return "Dining";
    case "nightlife": return "Nightlife";
    case "shopping": return "Shopping";
    case "outdoor": return "Outdoor";
    case "fitness": return "Fitness";
    case "kids": return "Kids & Family";
    case "asian_community": return "Asian Community";
    case "daily_errands": return "Daily Errands";
    case "faith": return "Faith";
    case "work_hubs": return "Work Hubs";
    case "healthcare": return "Healthcare";
    case "pets": return "Pets";
    case "transit": return "Transit";
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

export type ListingBucketVideoRow = {
  video_id: string;
  bucket: IntentBucket;
  status: "pending" | "processing" | "ready" | "approved" | "rejected" | "failed" | "superseded";
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
};

export async function listListingBucketVideos(
  listingId: string,
): Promise<ListingBucketVideoRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = (await supabase
    .from("generated_videos")
    .select("id, intent_bucket, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at")
    .eq("listing_id", listingId)
    .eq("scope", "listing_intent_bucket")
    .order("created_at", { ascending: false })) as {
    data: Array<{
      id: string;
      intent_bucket: string;
      status: string;
      cf_stream_uid: string | null;
      duration_s: number | null;
      input_photo_ids: string[] | null;
      error: string | null;
      created_at: string;
    }> | null;
  };

  return (data ?? []).map((r) => ({
    video_id: r.id,
    bucket: r.intent_bucket as IntentBucket,
    status: r.status as ListingBucketVideoRow["status"],
    cf_stream_uid: r.cf_stream_uid,
    duration_s: r.duration_s,
    photo_count: r.input_photo_ids?.length ?? 0,
    error: r.error,
    created_at: r.created_at,
  }));
}

// ─── narrative + status helpers (mirror community) ────────────────────────

export type ListingBucketVideoStatus = {
  video_id: string;
  status: "pending" | "processing" | "ready" | "approved" | "rejected" | "failed";
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
  narrative?:
    | (import("./narrative").VideoNarrative & { source?: string })
    | null;
} | null;

export async function getListingBucketVideoStatus(
  listingId: string,
  bucket: IntentBucket,
): Promise<ListingBucketVideoStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = (await supabase
    .from("generated_videos")
    .select(
      "id, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at, narrative",
    )
    .eq("listing_id", listingId)
    .eq("scope", "listing_intent_bucket")
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
      narrative: Record<string, unknown> | null;
    } | null;
  };

  if (!data) return null;

  const narr =
    data.narrative && typeof (data.narrative as { voiceover?: unknown }).voiceover === "string"
      ? (data.narrative as unknown as NonNullable<ListingBucketVideoStatus>["narrative"])
      : null;

  return {
    video_id: data.id,
    status: data.status as NonNullable<ListingBucketVideoStatus>["status"],
    cf_stream_uid: data.cf_stream_uid,
    duration_s: data.duration_s,
    photo_count: data.input_photo_ids?.length ?? 0,
    error: data.error,
    created_at: data.created_at,
    narrative: narr,
  };
}

/**
 * Raw pool size of approved photos eligible for this listing x bucket,
 * before the round-robin cap. Mirrors community counterpart.
 */
export async function getListingBucketEligiblePhotoCount(
  listingId: string,
  bucket: IntentBucket,
): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: approved } = (await supabase
    .from("listing_poi_photos")
    .select("poi_photo_id, poi_photos!inner(poi_id, applicable_buckets)")
    .eq("listing_id", listingId)
    .eq("status", "approved")) as {
    data: Array<{
      poi_photo_id: string;
      poi_photos: { poi_id: string; applicable_buckets: string[] | null };
    }> | null;
  };
  if (!approved || approved.length === 0) return 0;

  const poiIds = Array.from(new Set(approved.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois } = (await supabase
    .from("listing_pois")
    .select("poi_id")
    .eq("listing_id", listingId)
    .eq("intent_bucket", bucket)
    .eq("status", "approved")
    .in("poi_id", poiIds)) as { data: Array<{ poi_id: string }> | null };
  const bucketPoiSet = new Set((bucketPois ?? []).map((p) => p.poi_id));

  let count = 0;
  for (const r of approved) {
    const tags = r.poi_photos.applicable_buckets;
    if (tags && tags.length > 0) {
      if (tags.includes(bucket)) count += 1;
    } else if (bucketPoiSet.has(r.poi_photos.poi_id)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Phase 101: manual "Regenerate description" trigger for listing-scoped
 * bucket videos. Same Anthropic-narrative pipeline as community + listing
 * legacy — narrative.ts already accepts either owner. Revalidates the
 * listing edit page.
 */
export async function regenerateListingBucketVideoNarrative(
  videoId: string,
): Promise<
  | { ok: true; narrative: NonNullable<ListingBucketVideoStatus>["narrative"] }
  | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: owned } = (await supabase
    .from("generated_videos")
    .select("id, listing_id, scope")
    .eq("id", videoId)
    .maybeSingle()) as {
    data: { id: string; listing_id: string | null; scope: string } | null;
  };
  if (!owned || !owned.listing_id || owned.scope !== "listing_intent_bucket")
    return { ok: false, message: "Video not found or not owned by you." };

  const { generateBucketVideoNarrative } = await import("./narrative");
  const res = await generateBucketVideoNarrative(videoId);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath(`/dashboard/listings/${owned.listing_id}/edit`);
  return { ok: true, narrative: res.narrative };
}
