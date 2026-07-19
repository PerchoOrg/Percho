/**
 * bucket-video narrative generator.
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

import { extractJsonObject } from '@/lib/ai/anthropic';
import { createServiceClient } from '@/lib/supabase/server';
import type { IntentBucket } from './types';

const NARRATIVE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
const API_BASE = 'https://api.anthropic.com/v1/messages';

/**
 * Per-clip caption fields. Populated by the LLM alongside the
 * voiceover beat and consumed by the caption overlay pipeline in
 * `scripts/caption-render/overlay.html`. All fields are optional — the
 * worker falls back to POI name / bucket label when a field is missing,
 * never to fabricated ratings or reviews.
 *
 * Field-per-archetype (see CAPTION_ARCHETYPE_MAP in worker.py):
 *  - LIFESTYLE  → `why` (≤12 words, emotional)
 *  - NARRATIVE  → `quote` (≤8 words, punchy pull-quote)
 *  - MAGAZINE   → `title` (≤6 words, editorial) + `chapter` (2-3 words)
 *  - TRUST / UTILITY / MAP → no LLM fields (data-driven; TRUST uses Apify)
 */
export type CaptionFields = {
  quote?: string;
  why?: string;
  title?: string;
  chapter?: string;
};

export type VideoNarrative = {
  bucket: IntentBucket;
  intro: string;
  scenes: Array<{
    poi_id: string | null;
    poi_name: string;
    beat: string;
    caption_fields?: CaptionFields;
  }>;
  closing: string;
  voiceover: string;
  generated_at: string;
  model: string;
  photo_count: number;
};

const BUCKET_HOOKS: Record<IntentBucket, string> = {
  schools: "the schools a buyer's kids would attend and what the campus feels like",
  dining: 'the dining scene a buyer would enjoy — restaurants, cafes, bakeries',
  nightlife: 'the nightlife and entertainment a buyer would spend evenings on',
  shopping: 'the shopping a buyer has within reach — malls, department stores, boutiques',
  outdoor: 'the outdoor life around this home — parks, trails, greenspace',
  fitness: 'the fitness and wellness options a buyer would build a routine around',
  kids: 'the kids-and-family activities a buyer with children would use every week',
  asian_community: 'the Asian community amenities — supermarkets, restaurants, cultural anchors',
  daily_errands: 'the daily-errand runs a buyer will do every week — grocery, pharmacy',
  faith: 'the faith communities near this home',
  work_hubs: 'the work hubs and coworking near this home for hybrid or remote workers',
  healthcare: 'the healthcare access from this home — hospitals, urgent care, clinics',
  pets: 'the pet-friendly amenities near this home — vets, pet stores, dog-friendly spots',
  transit: 'the transit and commute story from this home — stations, highways, airport',
};

/**
 * 14 nearby buckets → 6 caption archetype (mirror of CAPTION_ARCHETYPE_MAP in
 * scripts/render-worker/worker.py; keep in sync). Drives which
 * caption_fields the LLM emits.
 */
const CAPTION_ARCHETYPE: Record<
  IntentBucket,
  'TRUST' | 'LIFESTYLE' | 'UTILITY' | 'NARRATIVE' | 'MAGAZINE' | 'MAP'
> = {
  schools: 'TRUST',
  healthcare: 'TRUST',
  dining: 'LIFESTYLE',
  fitness: 'LIFESTYLE',
  shopping: 'UTILITY',
  daily_errands: 'UTILITY',
  pets: 'UTILITY',
  nightlife: 'NARRATIVE',
  outdoor: 'MAP',
  transit: 'MAP',
  work_hubs: 'MAP',
  kids: 'MAGAZINE',
  asian_community: 'MAGAZINE',
  faith: 'MAGAZINE',
};

/**
 * Archetype-specific caption_fields JSON schema fragment for the LLM prompt.
 * Kept small (≤12 words per field) so caption overlays stay legible and
 * cheap. TRUST/UTILITY/MAP get no LLM fields — TRUST uses Apify data,
 * UTILITY/MAP are data-driven (drive time, mode).
 */
function captionFieldsSpec(archetype: ReturnType<typeof captionArchetype>): string | null {
  switch (archetype) {
    case 'LIFESTYLE':
      return `"caption_fields": { "why": "≤12 words, emotional single line evoking why this POI matters to daily life. No stats, no addresses. Example: \\"Where morning walks turn into weekend rituals.\\"" }`;
    case 'NARRATIVE':
      return `"caption_fields": { "quote": "≤8 words, punchy pull-quote in the voice of a resident or a wistful narrator. No POI name inside the quote. Example: \\"The city hums after midnight.\\"" }`;
    case 'MAGAZINE':
      return `"caption_fields": { "title": "≤6 words, editorial headline. Example: \\"Where Sunday shopping means home.\\"", "chapter": "2-3 word chapter label. Example: \\"The Bazaar\\" or \\"Family Rites\\"" }`;
    default:
      return null;
  }
}

function captionArchetype(bucket: IntentBucket) {
  return CAPTION_ARCHETYPE[bucket];
}

function buildPrompt(
  bucket: IntentBucket,
  scenes: Array<{ poi_name: string; description: string }>,
): string {
  const scenesText = scenes
    .map((s, i) => `${i + 1}. ${s.poi_name} — ${s.description || '(no description)'}`)
    .join('\n');

  const archetype = captionArchetype(bucket);
  const fieldsSpec = captionFieldsSpec(archetype);
  const sceneShape = fieldsSpec
    ? `{ "poi_name": "<exact name from list>", "beat": "1 sentence, 6-14 words describing what the viewer sees + why it matters", ${fieldsSpec} }`
    : `{ "poi_name": "<exact name from list>", "beat": "1 sentence, 6-14 words describing what the viewer sees + why it matters" }`;

  const fieldsRule = fieldsSpec
    ? `\n- caption_fields is REQUIRED for every scene. Follow the word caps strictly. If the description gives nothing to work with, write a generic-but-honest line — never invent ratings, awards, or reviews.`
    : '';

  return `You are writing a short voiceover script for a real-estate video slideshow.

BUCKET: "${bucket}" (archetype: ${archetype}) — ${BUCKET_HOOKS[bucket]}.

SCENES (in order — one per photo in the video):
${scenesText}

WRITE JSON matching this schema:
{
  "intro": "1 sentence, 8-15 words, hooks the viewer into the ${bucket} story",
  "scenes": [
    ${sceneShape}
  ],
  "closing": "1 sentence, 6-12 words, wraps up",
  "voiceover": "The intro + all beats + closing, joined into flowing prose. This is what TTS will read. Under 90 words total. Natural, conversational American English. No hashtags, no emojis, no addresses."
}

RULES:
- Every scene in the input MUST appear in scenes[] in the same order.
- Vary sentence structure — do not start every beat with "The" or "Enjoy".
- Never invent facts not implied by the description.
- Keep the total voiceover under 90 words (roughly 35-40 seconds spoken).${fieldsRule}

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
  { ok: true; narrative: VideoNarrative } | { ok: false; error: string; message: string }
> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'missing_key', message: 'ANTHROPIC_API_KEY not set' };
  }

  const admin = createServiceClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: video, error: vErr } = (await (admin as any)
    .from('generated_videos')
    .select('id, listing_id, intent_bucket, input_photo_ids, status, scope')
    .eq('id', videoId)
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
    return { ok: false, error: 'not_found', message: vErr?.message ?? 'Video not found' };
  }
  if (
    (video.scope !== 'intent_bucket' && video.scope !== 'community_intent_bucket') ||
    !video.intent_bucket
  ) {
    return {
      ok: false,
      error: 'wrong_scope',
      message: 'Only intent-bucket videos support narrative generation.',
    };
  }
  const photoIds = video.input_photo_ids ?? [];
  if (photoIds.length === 0) {
    return {
      ok: false,
      error: 'no_photos',
      message: 'This video has no input photos.',
    };
  }

  // Fetch photos + ai_tags + their POI names.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photos, error: pErr } = (await (admin as any)
    .from('poi_photos')
    .select('id, poi_id, ai_tags, pois!inner(display_name)')
    .in('id', photoIds)) as {
    data: Array<{
      id: string;
      poi_id: string;
      ai_tags: { description?: string } | null;
      pois: { display_name: string };
    }> | null;
    error: { message: string } | null;
  };

  if (pErr || !photos) {
    return { ok: false, error: 'photo_query_failed', message: pErr?.message ?? '' };
  }

  // Preserve the input_photo_ids order (that's the video's actual scene order).
  const byId = new Map(photos.map((p) => [p.id, p]));
  const scenes = photoIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      poi_id: p.poi_id,
      poi_name: p.pois.display_name,
      description: p.ai_tags?.description ?? '',
    }));

  if (scenes.length === 0) {
    return { ok: false, error: 'no_scenes', message: 'Photos have no descriptions yet.' };
  }

  const prompt = buildPrompt(video.intent_bucket, scenes);

  let raw: string;
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[narrative] anthropic error:', res.status, body.slice(0, 200));
      return { ok: false, error: 'anthropic_error', message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!raw) {
      return { ok: false, error: 'empty_response', message: 'Anthropic returned no text.' };
    }
  } catch (err) {
    console.error('[narrative] anthropic call failed:', err);
    return { ok: false, error: 'network', message: (err as Error).message };
  }

  const jsonStr = extractJsonObject(raw) ?? raw.trim();
  let parsed: {
    intro?: string;
    scenes?: Array<{
      poi_name?: string;
      beat?: string;
      caption_fields?: {
        quote?: unknown;
        why?: unknown;
        title?: unknown;
        chapter?: unknown;
      };
    }>;
    closing?: string;
    voiceover?: string;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[narrative] JSON parse failed:', raw.slice(0, 300));
    return { ok: false, error: 'parse_failed', message: 'Model returned invalid JSON.' };
  }

  const archetype = captionArchetype(video.intent_bucket);

  // Word-cap + string-sanitize a caption field. Truncation is soft — extra
  // words drop, not the whole line. Returns undefined when input is not a
  // non-empty string.
  const capWords = (val: unknown, maxWords: number): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim().replace(/^["“”]|["“”]$/g, '');
    if (!trimmed) return undefined;
    const words = trimmed.split(/\s+/);
    return words.slice(0, maxWords).join(' ');
  };

  const extractCaptionFields = (
    raw: NonNullable<typeof parsed.scenes>[number]['caption_fields'],
  ): CaptionFields | undefined => {
    if (!raw) return undefined;
    switch (archetype) {
      case 'LIFESTYLE': {
        const why = capWords(raw.why, 12);
        return why ? { why } : undefined;
      }
      case 'NARRATIVE': {
        const quote = capWords(raw.quote, 8);
        return quote ? { quote } : undefined;
      }
      case 'MAGAZINE': {
        const title = capWords(raw.title, 6);
        const chapter = capWords(raw.chapter, 3);
        if (!title && !chapter) return undefined;
        return { ...(title && { title }), ...(chapter && { chapter }) };
      }
      default:
        return undefined;
    }
  };

  // Align returned scenes to input order (by poi_name match, positional fallback).
  const returnedScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const stitchedScenes = scenes.map((s, i) => {
    const match =
      returnedScenes.find((r) => (r.poi_name ?? '').trim() === s.poi_name) ?? returnedScenes[i];
    const captionFields = extractCaptionFields(match?.caption_fields);
    return {
      poi_id: s.poi_id,
      poi_name: s.poi_name,
      beat: typeof match?.beat === 'string' ? match.beat.slice(0, 240) : '',
      ...(captionFields && { caption_fields: captionFields }),
    };
  });

  const narrative: VideoNarrative = {
    bucket: video.intent_bucket,
    intro: typeof parsed.intro === 'string' ? parsed.intro.slice(0, 200) : '',
    scenes: stitchedScenes,
    closing: typeof parsed.closing === 'string' ? parsed.closing.slice(0, 200) : '',
    voiceover: typeof parsed.voiceover === 'string' ? parsed.voiceover.slice(0, 800) : '',
    generated_at: new Date().toISOString(),
    model: NARRATIVE_MODEL,
    photo_count: scenes.length,
  };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error: updErr } = await (admin as any)
    .from('generated_videos')
    .update({ narrative })
    .eq('id', videoId);

  if (updErr) {
    console.error('[narrative] update failed:', updErr);
    return { ok: false, error: 'update_failed', message: updErr.message };
  }

  return { ok: true, narrative };
}
