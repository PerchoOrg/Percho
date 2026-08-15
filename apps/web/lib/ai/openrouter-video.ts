/**
 * OpenRouter video generation (image → video).
 *
 * Ported from the verified spike at
 * `scripts/spikes/seedance-community-video/spike.py`. The flow is:
 *
 *   1. POST /files          multipart 'file' → { data: { url } }
 *   2. POST /videos         model + prompt + frame_images (one or more first_frame)
 *                           → { id, polling_url }
 *   3. GET  <polling_url>   until status = completed | failed
 *   4. GET  unsigned_urls[0]  → the mp4 bytes
 *
 * Seedance 2.0 Mini accepts up to 9 `first_frame` reference images in one
 * job — the community tour sends every selected photo as a frame, and the
 * provider weaves them into a single video. Callers that want N photos in a
 * video submit ONE job with N frames.
 *
 * Cost guard: every call here spends money. Nothing in this module retries on
 * its own — the caller owns the state machine and decides when to submit.
 */

export const SEEDANCE_MODEL = 'bytedance/seedance-2.0-mini';

const API = 'https://openrouter.ai/api/v1';

function apiKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error('OPENROUTER_API_KEY not set');
  return k;
}

async function failure(res: Response, label: string): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(`OpenRouter ${label} ${res.status}: ${body.slice(0, 300)}`);
}

/** Upload a reference image; returns the OpenRouter-hosted URL for it. */
export async function uploadFrameImage(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), filename);

  const res = await fetch(`${API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) throw await failure(res, '/files');

  const data = (await res.json()) as { data?: { url?: string } };
  const url = data.data?.url;
  if (!url) throw new Error('OpenRouter /files returned no data.url');
  return url;
}

/** Submit an image-to-video job with one or more first-frame reference images. */
export async function submitVideo(opts: {
  prompt: string;
  frameImageUrls: string[];
  durationS: number;
  aspectRatio: string;
}): Promise<{ id: string; pollingUrl: string }> {
  const res = await fetch(`${API}/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SEEDANCE_MODEL,
      prompt: opts.prompt,
      duration: opts.durationS,
      aspect_ratio: opts.aspectRatio,
      frame_images: opts.frameImageUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
        frame_type: 'first_frame',
      })),
      generate_audio: false,
    }),
  });
  if (!res.ok) throw await failure(res, '/videos');

  const data = (await res.json()) as {
    id?: string;
    polling_url?: string;
    error?: unknown;
  };
  if (data.error) throw new Error(`OpenRouter /videos error: ${errorText(data.error)}`);
  if (!data.polling_url) throw new Error('OpenRouter /videos returned no polling_url');
  return { id: data.id ?? '', pollingUrl: data.polling_url };
}

export type VideoJobState =
  | { status: 'processing' }
  | { status: 'completed'; videoUrl: string }
  | { status: 'failed'; error: string };

/**
 * Shape of a poll response, without the HTTP. Split out so the state mapping
 * is testable — it is the part that decides whether we spend money again.
 */
export function parseVideoStatus(payload: unknown): VideoJobState {
  const data = (payload ?? {}) as {
    status?: unknown;
    error?: unknown;
    unsigned_urls?: unknown;
  };
  const status = typeof data.status === 'string' ? data.status : '';

  if (status === 'failed') {
    return { status: 'failed', error: errorText(data.error) || 'generation failed' };
  }
  if (status === 'completed') {
    const urls = Array.isArray(data.unsigned_urls) ? data.unsigned_urls : [];
    const first = urls.find((u): u is string => typeof u === 'string' && u.length > 0);
    if (!first) return { status: 'failed', error: 'completed but no video URL returned' };
    return { status: 'completed', videoUrl: first };
  }
  return { status: 'processing' };
}

export async function pollVideo(pollingUrl: string): Promise<VideoJobState> {
  const res = await fetch(pollingUrl, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    // 4xx (bad key / bad job id) will not fix itself; 5xx and 429 might, so the
    // caller keeps the row 'processing' and tries again on the next pump.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw await failure(res, 'poll');
    }
    return { status: 'processing' };
  }
  return parseVideoStatus(await res.json());
}

/**
 * `unsigned_urls` may point at a storage/CDN host — never hand the API key to
 * a third party (spike.py `download()` makes the same check).
 */
export function isOpenRouterHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

export async function downloadVideo(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: isOpenRouterHost(url) ? { Authorization: `Bearer ${apiKey()}` } : {},
  });
  if (!res.ok) throw await failure(res, 'video download');
  return res.arrayBuffer();
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    return JSON.stringify(err).slice(0, 300);
  }
  return '';
}
