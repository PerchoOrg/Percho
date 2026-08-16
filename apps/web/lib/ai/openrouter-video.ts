/**
 * OpenRouter video generation (image → video).
 *
 * Ported from the verified spike at
 * `scripts/spikes/seedance-community-video/spike.py`. The flow is:
 *
 *   1. POST /videos         model + prompt + input_references (reference
 *                           images) → { id, polling_url }
 *   2. GET  <polling_url>   until status = completed | failed
 *   3. GET  unsigned_urls[0]  → the mp4 bytes
 *
 * TWO image modes (verified live 2026-08-15):
 *   - frame_images:   first/last frame control. MAX 2 images (first + last).
 *   - input_references: style/content references. Seedance 2.0 supports up
 *                     to 9. This is the mode for a community tour — every
 *                     selected photo is a reference, the model weaves them
 *                     into one video. NEVER send both fields together.
 *
 * Cost guard: every call here spends money. Nothing in this module retries on
 * its own — the caller owns the state machine and decides when to submit.
 */

/**
 * Seedance 1.5 Pro — owner's explicit choice 2026-08-17 (was 2.0 Mini).
 * Do NOT change the model without explicit owner approval.
 */
export const SEEDANCE_MODEL = 'bytedance/seedance-1-5-pro';

const API = 'https://openrouter.ai/api/v1';

function apiKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error('OPENROUTER_API_KEY not set');
  return k;
}

/** 45s ceiling per HTTP call — a hung connection must not block the worker's
 *  single-threaded tick forever (owner 2026-08-16). */
const FETCH_TIMEOUT_MS = 45_000;

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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw await failure(res, '/files');

  const data = (await res.json()) as { data?: { url?: string } };
  const url = data.data?.url;
  if (!url) throw new Error('OpenRouter /files returned no data.url');
  return url;
}

/**
 * Submit a video job. By default uses `input_references` (reference-to-video,
 * up to 9 images — the community tour mode). Pass `mode: 'frames'` with ≤2
 * urls for first/last-frame control.
 */
export async function submitVideo(opts: {
  prompt: string;
  frameImageUrls: string[];
  durationS: number;
  aspectRatio: string;
  mode?: 'references' | 'frames';
}): Promise<{ id: string; pollingUrl: string }> {
  const mode = opts.mode ?? 'references';
  const images = opts.frameImageUrls.map((url) => ({
    type: 'image_url',
    image_url: { url },
  }));

  if (mode === 'frames' && images.length > 2) {
    throw new Error('frame_images mode supports at most 2 images (first + last frame)');
  }

  const body: Record<string, unknown> = {
    model: SEEDANCE_MODEL,
    prompt: opts.prompt,
    duration: opts.durationS,
    aspect_ratio: opts.aspectRatio,
    // Owner 2026-08-17: 480p — faster + cheaper than the 720p default; the
    // final video gets re-encoded by the worker for streaming anyway.
    resolution: '480p',
    // Music belongs at assemble time, not per-clip — every clip would get a
    // different random track. Also cheaper (audio gen is billed separately).
    generate_audio: false,
  };
  if (mode === 'frames') {
    body.frame_images = images.map((img, i) => ({
      ...img,
      frame_type: i === 0 ? 'first_frame' : 'last_frame',
    }));
  } else {
    body.input_references = images;
  }

  const res = await fetch(`${API}/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
  | { status: 'completed'; videoUrl: string; costUsd: number | null }
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
    usage?: { cost?: unknown };
  };
  const status = typeof data.status === 'string' ? data.status : '';

  if (status === 'failed' || status === 'expired') {
    return {
      status: 'failed',
      error:
        errorText(data.error) ||
        (status === 'expired'
          ? 'generation expired (provider queue TTL) — regenerate'
          : 'generation failed'),
    };
  }
  if (status === 'completed') {
    const urls = Array.isArray(data.unsigned_urls) ? data.unsigned_urls : [];
    const first = urls.find((u): u is string => typeof u === 'string' && u.length > 0);
    if (!first) return { status: 'failed', error: 'completed but no video URL returned' };
    const cost = data.usage?.cost;
    return {
      status: 'completed',
      videoUrl: first,
      costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    };
  }
  return { status: 'processing' };
}

export async function pollVideo(pollingUrl: string): Promise<VideoJobState> {
  const res = await fetch(pollingUrl, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
