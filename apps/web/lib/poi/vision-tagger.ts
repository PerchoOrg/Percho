/**
 * Vision tagger for POI photos —  *
 * Given a poi_photos.id, downloads the JPEG from Supabase Storage, sends it to
 * Gemini 2.5 Flash vision (migrated from Claude Sonnet 4.5, 2026-08-08), and fills:
 *   ai_tags       jsonb   {description, primary_category, tags[], mood, usable, reason}
 *   ai_score      numeric 0-1 (quality × relevance)
 *   ai_model      text
 *   tagged_at     timestamptz
 *   applicable_buckets text[]  — subset of {walkable, daily_drive, lifestyle, commute}
 *
 * Called as fire-and-forget from lib/poi/community-actions.ts on photo approve.
 * Idempotent: if tagged_at is set we skip. Errors are logged but never thrown —
 * tagging failures should NEVER block user actions.
 *
 * Cost: ~$0.0001-0.0005 per photo (Gemini 2.5 Flash, ~1200px input). A full
 * listing refresh (~100 photos) is ~$0.02-0.05.
 */

import { INTENT_BUCKETS, type IntentBucket } from '@/lib/poi/types';
import { createServiceClient } from '@/lib/supabase/server';
import { extractJsonObject } from '@/lib/utils/extract-json';

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-3.1-flash-lite';
const API_BASE = (m: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const POI_PHOTO_BUCKET = 'listing-photos';

export const PHOTO_CATEGORIES = [
  'storefront',
  'interior',
  'food',
  'landscape',
  'aerial',
  'people',
  'signage',
  'other',
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export type PhotoAiTags = {
  description: string;
  primary_category: PhotoCategory;
  tags: string[];
  mood: string | null;
  usable: boolean;
  reason: string | null;
};

// ─── prompt ────────────────────────────────────────────────────────────────

const SYSTEM = `You are labeling a single photo of a real-world point of interest (a school, restaurant, park, store, etc.) for a real estate video pipeline.

Your job is to decide:
1. What the photo actually shows (short factual description).
2. Its primary_category — the ONE tag that best describes the frame.
3. Which buyer-question buckets the photo would strengthen if a buyer asked "what's it like to live here?".
4. Whether the photo is usable at all (see PEOPLE below; also blurry,
   obstructed, or a readable license plate → usable=false).

PEOPLE — read this carefully, it is the rule most often got wrong.
A community is people. A pool with nobody in it, a park with nobody walking,
a cafe with nobody sitting reads as a brochure for an empty place, and a buyer
notices. Residents going about their day are the point of the footage, not a
defect in it. So:

- USABLE: people present but incidental to the frame — in the background, at a
  distance, turned away, in motion, small in a wide shot. A family walking a
  trail, swimmers in a pool, customers at tables. This is a plus, not a
  problem. Do not lower the score for it.
- NOT USABLE: an identifiable ADULT is the subject of the photo — a portrait,
  a posed group, one or two people filling the frame with clear faces. That is
  a picture of a person, not of a place, and we have no likeness release.
- NEVER USABLE: any IDENTIFIABLE minor. If a child's face is resolved clearly
  enough that someone who knows them could pick them out, usable=false
  whatever else the photo shows, and say so in "reason". This one has no
  exceptions.
  Identifiable is the test, not present. A distant figure whose face is a few
  pixels across, someone turned away, a silhouette, a blurred passer-by — none
  of those is identifiable, and none of them makes a photo unusable. Do not
  guess an age you cannot see: if you cannot tell whether a small distant
  figure is a child, it is not identifiable either way.

BUCKETS (a photo can strengthen 0, 1, or many):
- schools         : school campuses, buildings, entrances. Campuses are where
                    the minors rule bites hardest — a wide shot of a building
                    is fine, a photo with pupils' faces in it is not.
- dining          : restaurants, cafes, bakeries — food + interior + storefront
- nightlife       : bars, clubs, movie theaters, evening/night ambience
- shopping        : malls, department stores, boutiques, retail interiors
- outdoor         : parks, trails, greenspace, water, tourist attractions
- fitness         : gyms, yoga studios, spa, wellness spaces
- kids            : amusement parks, aquariums, zoos, libraries, kid-friendly venues
- asian_community : Asian supermarkets, Asian restaurants, cultural anchors
- daily_errands   : grocery stores, pharmacies, supermarkets — errand-run locations
- faith           : churches, mosques, synagogues, temples — sanctuary or exterior
- work_hubs       : coworking, office parks, business complexes
- healthcare      : hospitals, clinics, medical buildings (usually info-card only)
- pets            : vets, pet stores, dog parks, pet-friendly spaces
- transit         : train / subway stations, highways, airport, transit infrastructure

Set applicable_buckets = [] if the photo doesn't strengthen any bucket (e.g. a menu closeup, a generic wall).

CATEGORIES:
- storefront  : exterior facade / signage from outside
- interior   : inside a business
- food       : plated dishes, close-up food, drinks
- landscape  : parks, greenery, water, nature
- aerial     : drone / overhead
- people     : humans as the SUBJECT of the frame. Rare, and usable=false —
               a place with people in it is not this category, it is whatever
               the place is (landscape, interior, storefront).
- signage    : text-heavy, sign as subject
- other      : anything else

QUALITY / RELEVANCE SCORE 0.0-1.0:
- 0.9-1.0: bright, sharp, wide framing, obvious subject. A place shown in use —
  people enjoying it, incidentally — belongs here too.
- 0.6-0.8: usable but flawed (some blur, weird crop, unremarkable)
- 0.3-0.5: technically OK but boring or off-topic
- 0.0-0.2: unusable (dark, blurry, obstructed)

Return STRICT JSON only, no prose:
{
  "description": "storefront of Publix at dusk, warm interior glow",
  "primary_category": "storefront",
  "tags": ["night", "grocery", "warm-light"],
  "mood": "inviting" | null,
  "usable": true,
  "reason": null,
  "applicable_buckets": ["dining"],
  "score": 0.85
}`;

function userPromptForPoi(poi: {
  name: string;
  primary_type: string | null;
  intent_bucket: IntentBucket | null;
}): string {
  return `POI context — name: "${poi.name}", google_type: "${poi.primary_type ?? 'unknown'}", assigned_bucket: "${poi.intent_bucket ?? 'unknown'}".

Label this photo per the schema above.`;
}

// ─── vision call ───────────────────────────────────────────────────────────

async function callVision(opts: {
  imageBase64: string;
  mediaType: string;
  userPrompt: string;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(API_BASE(VISION_MODEL), {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: opts.mediaType,
                data: opts.imageBase64,
              },
            },
            { text: opts.userPrompt },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 512 },
    }),
    // The photos step tags one photo at a time in a serial loop, so a call
    // that never answers stops the whole run silently — the same way the
    // un-deadlined Places calls did (see google-places.ts, owner 2026-08-23).
    // tagPoiPhoto already reports a throw as `{ ok: false }` and moves on.
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Gemini vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error('Gemini vision returned no text');
  return text;
}

// ─── main entry ────────────────────────────────────────────────────────────

/**
 * Tag one photo. Idempotent (skips if already tagged). Non-throwing —
 * errors are logged so this can be called fire-and-forget from server actions.
 */
export async function tagPoiPhoto(poiPhotoId: string): Promise<{
  ok: boolean;
  skipped?: 'already_tagged' | 'no_key';
  error?: string;
}> {
  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, skipped: 'no_key' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  const { data: photo, error: photoErr } = await admin
    .from('poi_photos')
    .select('id, poi_id, storage_path, tagged_at')
    .eq('id', poiPhotoId)
    .maybeSingle();
  if (photoErr || !photo) {
    console.error(`[vision-tagger] photo ${poiPhotoId} not found:`, photoErr);
    return { ok: false, error: 'photo_not_found' };
  }
  if (photo.tagged_at) {
    return { ok: true, skipped: 'already_tagged' };
  }

  // Look up POI context — we send POI name/type to help the model disambiguate
  // (a photo of pasta could be "food" from a restaurant → lifestyle, but from
  // a grocery deli counter → daily_drive).
  const { data: poi } = await admin
    .from('pois')
    .select('id, display_name, primary_type')
    .eq('id', photo.poi_id)
    .maybeSingle();

  // Look up any community_pois row for bucket hint (any community works — pois
  // are global, and bucket is a distance thing that hints at "walkable place
  // vs highway thing"). switched from listing_pois → community_pois
  // when listing-level POI pipeline was retired.
  const { data: lp } = await admin
    .from('community_pois')
    .select('intent_bucket')
    .eq('poi_id', photo.poi_id)
    .limit(1)
    .maybeSingle();

  // Download the JPEG from Storage as base64.
  const { data: blob, error: dlErr } = await admin.storage
    .from(POI_PHOTO_BUCKET)
    .download(photo.storage_path);
  if (dlErr || !blob) {
    console.error(`[vision-tagger] storage download ${photo.storage_path} failed:`, dlErr);
    return { ok: false, error: 'download_failed' };
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const imageBase64 = buffer.toString('base64');

  // Call the model.
  let raw: string;
  try {
    raw = await callVision({
      imageBase64,
      mediaType: 'image/jpeg',
      userPrompt: userPromptForPoi({
        name: poi?.display_name ?? 'unknown',
        primary_type: poi?.primary_type ?? null,
        intent_bucket: (lp?.intent_bucket as IntentBucket | null) ?? null,
      }),
    });
  } catch (err) {
    console.error(`[vision-tagger] gemini call failed for ${poiPhotoId}:`, err);
    return { ok: false, error: 'gemini_error' };
  }

  // Parse JSON — tolerant of fences / trailing chatter (same helper the
  // listing-copy path uses).
  const jsonStr = extractJsonObject(raw) ?? raw.trim();
  let parsed: {
    description?: string;
    primary_category?: string;
    tags?: unknown;
    mood?: string | null;
    usable?: boolean;
    reason?: string | null;
    applicable_buckets?: unknown;
    score?: number;
  };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (_err) {
    console.error(`[vision-tagger] JSON parse failed for ${poiPhotoId}; raw=`, raw.slice(0, 300));
    return { ok: false, error: 'parse_failed' };
  }

  // Coerce + validate.
  const cat = (PHOTO_CATEGORIES as readonly string[]).includes(parsed.primary_category ?? '')
    ? (parsed.primary_category as PhotoCategory)
    : 'other';
  const applicable = Array.isArray(parsed.applicable_buckets)
    ? (parsed.applicable_buckets as unknown[]).filter((b): b is IntentBucket =>
        (INTENT_BUCKETS as readonly string[]).includes(b as string),
      )
    : [];
  const tagsList = Array.isArray(parsed.tags)
    ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 8)
    : [];
  const scoreRaw = typeof parsed.score === 'number' ? parsed.score : 0.5;
  const score = Math.max(0, Math.min(1, scoreRaw));

  const aiTags: PhotoAiTags = {
    description: typeof parsed.description === 'string' ? parsed.description.slice(0, 500) : '',
    primary_category: cat,
    tags: tagsList,
    mood: typeof parsed.mood === 'string' ? parsed.mood : null,
    usable: parsed.usable !== false,
    reason: typeof parsed.reason === 'string' ? parsed.reason : null,
  };

  const { error: updErr } = await admin
    .from('poi_photos')
    .update({
      ai_tags: aiTags,
      ai_score: score,
      ai_model: VISION_MODEL,
      tagged_at: new Date().toISOString(),
      applicable_buckets: applicable,
    })
    .eq('id', poiPhotoId);

  if (updErr) {
    console.error(`[vision-tagger] update failed for ${poiPhotoId}:`, updErr);
    return { ok: false, error: 'update_failed' };
  }
  return { ok: true };
}
