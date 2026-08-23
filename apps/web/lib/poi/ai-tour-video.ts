/**
 * Shared vocabulary for the Community Tour AI video feature (2026-08-15).
 *
 * Imported by BOTH the admin client component and the API route, so it stays
 * free of server-only imports.
 *
 * All selected photos become ONE video: Seedance 2.0 Mini accepts up to
 * MAX_PHOTOS_PER_BATCH first-frame reference images in a single job, and the
 * provider weaves them into one clip. One batch = one row in ai_tour_videos
 * with an input_photo_ids array.
 */

export const AI_VIDEO_BUCKET = 'ai-videos';

/** Seedance 2.0 Mini's documented cap on first-frame reference images. */
export const MAX_PHOTOS_PER_BATCH = 9;

export const AI_VIDEO_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export type AiVideoDuration = (typeof AI_VIDEO_DURATIONS)[number];

/**
 * The aspect a Seedance clip is generated at.
 *
 * 3:4 (0.75), not 9:16 (0.5625), since 2026-08-23. Every canvas these clips
 * land on is 1080x1576 = 0.685 (TOUR_CANVAS in worker.py, and the `ios`
 * surface of a home tour), and the assembler cover-crops
 * (`force_original_aspect_ratio=increase` + `crop`). A 9:16 clip was therefore
 * paying twice: the provider cropped a landscape facade photo into a tall
 * frame, then the assembler threw away 17.9% of the clip's HEIGHT to get back
 * to 0.685. At 3:4 the loss is 8.6% of the width and the provider keeps far
 * more of the house.
 *
 * 2:3 (0.667) would land within 2.7% of the canvas, but it is not in Seedance's
 * documented ratio list; 3:4 is. Worth a $0.06 probe if the last 6% matters.
 */
export const AI_VIDEO_ASPECT = '3:4';

export type AiTourVideoStatus = 'pending' | 'submitting' | 'processing' | 'ready' | 'failed';

export interface AiTourVideoRow {
  id: string;
  /** Photo ids that fed this batch (input_photo_ids). */
  photo_ids: string[];
  status: AiTourVideoStatus;
  /** Public URL of the finished mp4, null until status = 'ready'. */
  video_url: string | null;
  duration_s: number;
  prompt: string;
  /** OpenRouter generation cost in USD, from usage.cost at completion. */
  cost_usd: number | null;
  error: string | null;
  created_at: string;
}

/**
 * Prefill for the prompt box. The admin edits it before generating — it is a
 * starting point, not a template the code depends on.
 */
export function defaultTourPrompt(community: {
  name: string;
  city?: string | null;
  state?: string | null;
}): string {
  const place = [community.city, community.state].filter(Boolean).join(', ');
  return `A cinematic, photorealistic clip of ${community.name}${place ? ` in ${place}` : ''}. Camera: slow push-in with gentle parallax. Grade: warm, golden hour, natural. Atmosphere: welcoming, lived-in. No text, no people in close-up.`;
}

/**
 * Per-clip prompt frozen onto the row at enqueue time: the shared base plus
 * the POI the photo came from, so two clips in one batch are not asked for the
 * identical shot.
 */
export function clipPrompt(basePrompt: string, poiName: string | null | undefined): string {
  const base = basePrompt.trim();
  const poi = poiName?.trim();
  return poi ? `${base} Featured location: ${poi}.` : base;
}
