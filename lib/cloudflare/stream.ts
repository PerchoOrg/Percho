/**
 * Cloudflare Stream API wrapper.
 *
 * All calls require `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`.
 * Never call from the browser — these env vars are server-only.
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function authHeaders(): HeadersInit {
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_STREAM_API_TOKEN not set');
  return { Authorization: `Bearer ${token}` };
}

function accountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error('CLOUDFLARE_ACCOUNT_ID not set');
  return id;
}

/**
 * Create a TUS direct upload URL.
 *
 * The browser uses tus-js-client to upload directly to Cloudflare; the
 * server never sees the video bytes.
 *
 * @param uploadLength - file size in bytes (TUS Upload-Length header)
 * @param maxDurationSeconds - cap on video duration (cost guard); default 300s
 */
export async function createDirectUpload(opts: {
  uploadLength: number;
  maxDurationSeconds?: number;
  meta?: Record<string, string>;
}): Promise<{ uploadUrl: string; videoId: string }> {
  const meta = {
    maxDurationSeconds: String(opts.maxDurationSeconds ?? 300),
    ...opts.meta,
  };
  const uploadMetadata = Object.entries(meta)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',');

  const res = await fetch(`${CF_API_BASE}/accounts/${accountId()}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(opts.uploadLength),
      'Upload-Metadata': uploadMetadata,
    },
  });

  if (!res.ok) {
    throw new Error(`Cloudflare Stream create upload failed: ${res.status} ${await res.text()}`);
  }

  const videoId = res.headers.get('stream-media-id');
  const uploadUrl = res.headers.get('location');
  if (!videoId || !uploadUrl) {
    throw new Error('Cloudflare Stream did not return videoId or uploadUrl');
  }
  return { videoId, uploadUrl };
}

/**
 * HLS playback URL for hls.js / video.js.
 *
 * Requires the customer subdomain — exposed publicly via
 * NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN.
 */
export function hlsUrl(videoId: string): string {
  const sub = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN;
  if (!sub) throw new Error('NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN not set');
  return `https://${sub}.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
}

export function thumbnailUrl(videoId: string): string {
  const sub = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN;
  if (!sub) throw new Error('NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN not set');
  return `https://${sub}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.jpg`;
}

/**
 * Verify a Cloudflare Stream webhook signature.
 *
 * Header format:  `time=1234567890,sig1=hexhmac`
 * Signature is HMAC-SHA256 over `${time}.${rawBody}` with the webhook secret.
 *
 * Raw body is required — JSON.stringify(parsed) won't reproduce the signed bytes.
 */
export async function verifyWebhookSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  toleranceSec?: number;
}): Promise<boolean> {
  const { rawBody, signatureHeader } = opts;
  const tolerance = opts.toleranceSec ?? 300;
  if (!signatureHeader) return false;

  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('CLOUDFLARE_STREAM_WEBHOOK_SECRET not set');

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const time = parts.time;
  const sig = parts.sig1;
  if (!time || !sig) return false;

  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(time));
  if (skew > tolerance) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${time}.${rawBody}`));
  const expected = Array.from(new Uint8Array(expectedBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
