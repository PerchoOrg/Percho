/**
 * Curator — per-photo semantic annotation for a community tour (Phase 2).
 *
 * One call for the whole batch, images plus metadata. Batch-level, not
 * per-photo, because three of the fields only mean anything across a set:
 * "at most one opener", "at most one closer", and the wide→close pairing.
 *
 * The Curator decides NOTHING about rendering. It says what each photo is; the
 * Scheduler derives engine, move, order and duration from that plus the pixel
 * size. Keeping the split means every field here is enumerable, so it can be
 * scored against a human annotation pass (spec §9 Phase 2: ≥85% agreement on
 * dominant_subject / people_prominence / brand signage — the three that drive
 * the Guard's downgrades).
 *
 * Transport: the Files API, not inline base64. A 14-photo Peachtree Corners
 * batch is 25.5 MB of JPEG — 34 MB once base64-encoded, well past the ~20 MB
 * inline request ceiling. Files are uploaded once and referenced by URI, which
 * keeps "one generateContent call for the batch" true at any batch size.
 */

import { normalizeAnnotations } from './annotations';
import type { PhotoAnnotation, PlanWarning } from './types';

export const CURATOR_MODEL =
  process.env.GEMINI_CURATOR_MODEL ?? process.env.GEMINI_VISION_MODEL ?? 'gemini-3.1-flash-lite';

const FILES_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const GENERATE_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** ~230 output tokens per photo, plus headroom for a long batch. */
const MAX_OUTPUT_TOKENS = 8192;

export interface CuratorPhoto {
  photo_id: string;
  poi_name: string;
  /** Tour bucket of the POI — context only, the Curator does not reorder. */
  bucket: string;
  width_px: number;
  height_px: number;
  bytes: Uint8Array;
  mime_type: string;
}

export interface CuratorResult {
  annotations: PhotoAnnotation[];
  warnings: PlanWarning[];
  /** Requested photos the model returned nothing for. */
  missing: string[];
  /** Ids the model invented, dropped before normalization. */
  unknown: string[];
  /** 1 when the first reply parsed, 2 when the retry was needed. */
  attempts: number;
  model: string;
  raw: string;
}

// ─── prompt ─────────────────────────────────────────────────────────────────

/**
 * Owner's Prompt A, verbatim. Field semantics live in the prompt rather than
 * in code comments on purpose: this text is the contract the annotations are
 * scored against, and paraphrasing it would silently move the agreement bar.
 */
export const CURATOR_PROMPT = `You are a video curator for a real-estate community tour. You will receive a
batch of approved photos for a single neighborhood. For each photo, produce a
structured annotation.

CRITICAL: You do NOT choose the render engine, the camera move, the clip order,
or the duration. Those are computed downstream. Your job is to describe what
each photo IS, accurately and conservatively.

Return ONLY a JSON array. No preamble, no markdown fences, no commentary.

For each photo, emit an object with exactly these keys:

{
  "photo_id": string,

  "has_natural_motion": boolean,
    // True ONLY if the photo contains elements that genuinely move in reality
    // and are visible here: water surface, foliage in wind, clouds, flags,
    // flowing traffic, string lights. False for static built environments.

  "motion_hint": string,
    // If has_natural_motion, name the moving elements in 3-10 words,
    // e.g. "ripples on the lake, leaves swaying". Else "".

  "dominant_subject": one of
    ["nature","building_facade","street_perspective","interior_close",
     "open_space","signage"],
    // building_facade = a building is the main subject and its walls/windows
    //   define the frame. street_perspective = receding road or sidewalk lines.
    // Both force conservative rendering downstream, so classify honestly
    // rather than generously.

  "has_visible_people": boolean,
  "people_prominence": one of ["none","background","midground","foreground"],
    // "none" means the frame is empty of people. Be strict: a single distant
    // figure is "background", not "none".

  "has_readable_brand_signage": boolean,
    // True if any storefront name, logo, or trademark is legible.

  "has_rigid_geometry": boolean,
    // True if the frame contains regular repeating structures that would look
    // broken if distorted: running track lanes, parking stripes, window grids,
    // fence rails, brick coursing.

  "narrative_role": one of ["opener","establishing","detail","closer","filler"],
    // opener: calm, wide, sets a mood, works with no prior context.
    // establishing: introduces a POI at wide framing.
    // detail: a close view that only makes sense after an establishing shot
    //         of the same POI.
    // closer: warm, ideally evening, emotionally resonant, works as an ending.
    // filler: usable but not load-bearing.
    // Assign at most ONE opener and at most ONE closer across the batch.

  "time_of_day": integer 0-100,
    // 0=dawn 25=morning 50=midday 75=golden hour 85=dusk 100=night.
    // Judge from the light in the image, not from the caption.

  "emotional_weight": float 0-1,
    // How much a viewer would want to linger. Wide scenic and evening
    // atmosphere score high; utilitarian interiors score low.

  "poi_pair_with": string or null,
    // If another photo in this batch shows the SAME poi_name and the two form
    // a natural wide -> close pair, put that photo_id here. Both photos in a
    // pair must reference each other. Otherwise null.

  "pair_role": "wide" | "close" | null,

  "vo_line": string,
    // One spoken line of narration, max 14 words, plain declarative English.
    // Describe what a buyer gains from this place. No hype adjectives
    // ("stunning", "vibrant", "charming"). No second-person imperatives.
    // Return "" for photos that should carry no narration (typically the
    // "close" half of a pair, which rides on the wide shot's line).
    //
    // HARD CONSTRAINT - schools: never state or imply school assignment.
    // Forbidden: "zoned for", "your kids", "will attend", "assigned to",
    // "feeds into". Use location phrasing only, e.g. "Norcross High School
    // sits on the north side."

  "chip_label": string
    // On-screen label, max 24 chars, usually the POI name.
}

Photos:
{{PHOTO_BATCH}}`;

/** The metadata half of the batch; the images follow, each labelled by id. */
export function renderPhotoBatch(photos: CuratorPhoto[]): string {
  return photos
    .map(
      (p, i) =>
        `${i + 1}. photo_id: ${p.photo_id} | poi_name: ${p.poi_name} | bucket: ${p.bucket} | ${p.width_px}x${p.height_px}`,
    )
    .join('\n');
}

export function buildCuratorPrompt(photos: CuratorPhoto[]): string {
  return CURATOR_PROMPT.replace('{{PHOTO_BATCH}}', renderPhotoBatch(photos));
}

// ─── response parsing ───────────────────────────────────────────────────────

/** Pull the JSON array out of a reply that may carry fences or chatter. */
export function extractJsonArray(raw: string): string | null {
  const unfenced = raw.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return unfenced.slice(start, end + 1);
}

export class CuratorParseError extends Error {}

/**
 * Parse, drop hallucinated ids, then run the same coercions the Scheduler
 * relies on. Throws only when there is no array at all — that is the one case
 * worth spending a retry on.
 */
export function parseCuratorResponse(
  raw: string,
  expectedIds: string[],
): {
  annotations: PhotoAnnotation[];
  warnings: PlanWarning[];
  missing: string[];
  unknown: string[];
} {
  const json = extractJsonArray(raw);
  if (!json) throw new CuratorParseError('no JSON array in reply');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new CuratorParseError(`JSON.parse failed: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new CuratorParseError('reply is not an array');

  const expected = new Set(expectedIds);
  const unknown: string[] = [];
  const kept: unknown[] = [];
  for (const item of parsed) {
    const id = (item as { photo_id?: unknown })?.photo_id;
    if (typeof id === 'string' && expected.has(id)) kept.push(item);
    else if (typeof id === 'string') unknown.push(id);
  }

  const { annotations, warnings } = normalizeAnnotations(kept);
  const seen = new Set(annotations.map((a) => a.photo_id));
  return {
    annotations,
    warnings,
    missing: expectedIds.filter((id) => !seen.has(id)),
    unknown,
  };
}

// ─── model call ─────────────────────────────────────────────────────────────

interface UploadedFile {
  uri: string;
  mimeType: string;
}

/**
 * Files API, resumable protocol. Images are ACTIVE the moment the upload
 * finalizes (only video needs polling), so there is nothing to wait on.
 */
async function uploadFile(photo: CuratorPhoto, apiKey: string): Promise<UploadedFile> {
  const start = await fetch(FILES_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(photo.bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': photo.mime_type,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: photo.photo_id } }),
  });
  if (!start.ok) {
    throw new Error(`files.start ${start.status}: ${(await start.text()).slice(0, 200)}`);
  }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('files.start returned no upload URL');

  const done = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Length': String(photo.bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: photo.bytes as BodyInit,
  });
  if (!done.ok) {
    throw new Error(`files.upload ${done.status}: ${(await done.text()).slice(0, 200)}`);
  }
  const body = (await done.json()) as { file?: { uri?: string; mimeType?: string } };
  const uri = body.file?.uri;
  if (!uri) throw new Error('files.upload returned no uri');
  return { uri, mimeType: body.file?.mimeType ?? photo.mime_type };
}

async function callCurator(
  prompt: string,
  files: UploadedFile[],
  photos: CuratorPhoto[],
  apiKey: string,
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  files.forEach((file, i) => {
    parts.push({ text: `photo_id: ${photos[i]!.photo_id}` });
    parts.push({ fileData: { mimeType: file.mimeType, fileUri: file.uri } });
  });

  const res = await fetch(GENERATE_URL(CURATOR_MODEL), {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Annotation is a labelling task; sampling variance here shows up as
        // disagreement with the human baseline, not as better writing.
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`curator ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error('curator returned no text');
  return text;
}

/**
 * Annotate a whole batch. One retry on an unparseable reply, with the reason
 * appended — beyond that a bad batch is a data problem, not a sampling one,
 * and a retry loop just spends money on it.
 */
export async function curateBatch(photos: CuratorPhoto[]): Promise<CuratorResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (photos.length === 0) {
    return {
      annotations: [],
      warnings: [],
      missing: [],
      unknown: [],
      attempts: 0,
      model: CURATOR_MODEL,
      raw: '',
    };
  }

  const files: UploadedFile[] = [];
  for (const photo of photos) files.push(await uploadFile(photo, apiKey));

  const ids = photos.map((p) => p.photo_id);
  const prompt = buildCuratorPrompt(photos);
  let raw = await callCurator(prompt, files, photos, apiKey);
  try {
    return { ...parseCuratorResponse(raw, ids), attempts: 1, model: CURATOR_MODEL, raw };
  } catch (err) {
    if (!(err instanceof CuratorParseError)) throw err;
    const retryPrompt = `${prompt}\n\nYour previous reply could not be parsed (${err.message}). Return ONLY a JSON array of objects, no prose and no markdown fences.`;
    raw = await callCurator(retryPrompt, files, photos, apiKey);
    return { ...parseCuratorResponse(raw, ids), attempts: 2, model: CURATOR_MODEL, raw };
  }
}
