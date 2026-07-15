/**
 * Phase 78 (2026-07-15): bucket-video narrative generator.
 *
 * Turns a ready bucket video's already-tagged photos into a structured
 * narrative script that we can later feed to TTS. Photos already carry
 * `poi_photos.ai_tags.description` (from `lib/poi/vision-tagger.ts`), so
 * this is a cheap text-only Claude call — no re-vision needed.
 *
 * Writes back to `generated_videos.narrative` (existing jsonb column, no
 * schema change).
 *
 * Cost: ~$0.005-0.01 per video (Sonnet 4.5, ≤~2k input tokens for 15 photos).
 * Manual trigger only — the "Regenerate description" button in the Nearby
 * tab. Never fired automatically to keep spend predictable.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { extractJsonObject } from "@/lib/ai/anthropic";
import type { IntentBucket } from "./types";

const NARRATIVE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const API_BASE = "https://api.anthropic.com/v1/messages";

export type VideoNarrative = {
  bucket: IntentBucket;
  intro: string;
  scenes: Array<{
    poi_id: string | null;
    poi_name: string;
    beat: string;
  }>;
  closing: string;
  voiceover: string;
  generated_at: string;
  model: string;
  photo_count: number;
};

const BUCKET_HOOKS: Record<IntentBucket, string> = {
  walkable:
    "the walkable pockets a buyer could reach on foot in under ten minutes",
  daily_drive:
    "the daily-drive essentials a buyer will use every week — grocery, coffee, gym",
  lifestyle:
    "the lifestyle destinations that make a weekend here — restaurants, parks, culture",
  commute: "the commute + regional-access story from this location",
};

function buildPrompt(
  bucket: IntentBucket,
  scenes: Array<{ poi_name: string; description: string }>,
): string {
  const scenesText = scenes
    .map(
      (s, i) => `${i + 1}. ${s.poi_name} — ${s.description || "(no description)"}`,
    )
    .join("\n");

  return `You are writing a short voiceover script for a real-estate video slideshow.

BUCKET: "${bucket}" — ${BUCKET_HOOKS[bucket]}.

SCENES (in order — one per photo in the video):
${scenesText}

WRITE JSON matching this schema:
{
  "intro": "1 sentence, 8-15 words, hooks the viewer into the ${bucket} story",
  "scenes": [
    { "poi_name": "<exact name from list>", "beat": "1 sentence, 6-14 words describing what the viewer sees + why it matters" }
  ],
  "closing": "1 sentence, 6-12 words, wraps up",
  "voiceover": "The intro + all beats + closing, joined into flowing prose. This is what TTS will read. Under 90 words total. Natural, conversational American English. No hashtags, no emojis, no addresses."
}

RULES:
- Every scene in the input MUST appear in scenes[] in the same order.
- Vary sentence structure — do not start every beat with "The" or "Enjoy".
- Never invent facts not implied by the description.
- Keep the total voiceover under 90 words (roughly 35-40 seconds spoken).

Return ONLY the JSON. No prose, no fences.`;
}

/**
 * Regenerate the narrative for a bucket video. Idempotent — overwrites
 * whatever is in `generated_videos.narrative` today.
 *
 * Caller must have already verified ownership (server action does this).
 */
export async function generateBucketVideoNarrative(
  videoId: string,
): Promise<
  | { ok: true; narrative: VideoNarrative }
  | { ok: false; error: string; message: string }
> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing_key", message: "ANTHROPIC_API_KEY not set" };
  }

  const admin = createServiceClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: video, error: vErr } = (await (admin as any)
    .from("generated_videos")
    .select("id, listing_id, intent_bucket, input_photo_ids, status, scope")
    .eq("id", videoId)
    .maybeSingle()) as {
    data: {
      id: string;
      listing_id: string;
      intent_bucket: IntentBucket | null;
      input_photo_ids: string[] | null;
      status: string;
      scope: string;
    } | null;
    error: { message: string } | null;
  };

  if (vErr || !video) {
    return { ok: false, error: "not_found", message: vErr?.message ?? "Video not found" };
  }
  if (video.scope !== "intent_bucket" || !video.intent_bucket) {
    return {
      ok: false,
      error: "wrong_scope",
      message: "Only intent-bucket videos support narrative generation.",
    };
  }
  const photoIds = video.input_photo_ids ?? [];
  if (photoIds.length === 0) {
    return {
      ok: false,
      error: "no_photos",
      message: "This video has no input photos.",
    };
  }

  // Fetch photos + ai_tags + their POI names.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photos, error: pErr } = (await (admin as any)
    .from("poi_photos")
    .select("id, poi_id, ai_tags, pois!inner(display_name)")
    .in("id", photoIds)) as {
    data: Array<{
      id: string;
      poi_id: string;
      ai_tags: { description?: string } | null;
      pois: { display_name: string };
    }> | null;
    error: { message: string } | null;
  };

  if (pErr || !photos) {
    return { ok: false, error: "photo_query_failed", message: pErr?.message ?? "" };
  }

  // Preserve the input_photo_ids order (that's the video's actual scene order).
  const byId = new Map(photos.map((p) => [p.id, p]));
  const scenes = photoIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      poi_id: p.poi_id,
      poi_name: p.pois.display_name,
      description: p.ai_tags?.description ?? "",
    }));

  if (scenes.length === 0) {
    return { ok: false, error: "no_scenes", message: "Photos have no descriptions yet." };
  }

  const prompt = buildPrompt(video.intent_bucket, scenes);

  let raw: string;
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[narrative] anthropic error:", res.status, body.slice(0, 200));
      return { ok: false, error: "anthropic_error", message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    raw = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!raw) {
      return { ok: false, error: "empty_response", message: "Anthropic returned no text." };
    }
  } catch (err) {
    console.error("[narrative] anthropic call failed:", err);
    return { ok: false, error: "network", message: (err as Error).message };
  }

  const jsonStr = extractJsonObject(raw) ?? raw.trim();
  let parsed: {
    intro?: string;
    scenes?: Array<{ poi_name?: string; beat?: string }>;
    closing?: string;
    voiceover?: string;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[narrative] JSON parse failed:", raw.slice(0, 300));
    return { ok: false, error: "parse_failed", message: "Model returned invalid JSON." };
  }

  // Align returned scenes to input order (by poi_name match, positional fallback).
  const returnedScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const stitchedScenes = scenes.map((s, i) => {
    const match =
      returnedScenes.find((r) => (r.poi_name ?? "").trim() === s.poi_name) ??
      returnedScenes[i];
    return {
      poi_id: s.poi_id,
      poi_name: s.poi_name,
      beat: typeof match?.beat === "string" ? match.beat.slice(0, 240) : "",
    };
  });

  const narrative: VideoNarrative = {
    bucket: video.intent_bucket,
    intro: typeof parsed.intro === "string" ? parsed.intro.slice(0, 200) : "",
    scenes: stitchedScenes,
    closing: typeof parsed.closing === "string" ? parsed.closing.slice(0, 200) : "",
    voiceover: typeof parsed.voiceover === "string" ? parsed.voiceover.slice(0, 800) : "",
    generated_at: new Date().toISOString(),
    model: NARRATIVE_MODEL,
    photo_count: scenes.length,
  };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error: updErr } = await (admin as any)
    .from("generated_videos")
    .update({ narrative })
    .eq("id", videoId);

  if (updErr) {
    console.error("[narrative] update failed:", updErr);
    return { ok: false, error: "update_failed", message: updErr.message };
  }

  return { ok: true, narrative };
}
