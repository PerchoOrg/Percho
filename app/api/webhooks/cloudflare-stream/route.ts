import { verifyWebhookSignature } from '@/lib/cloudflare/stream';
import { createServiceClient } from '@/lib/supabase/server';
/**
 * Cloudflare Stream webhook receiver.
 *
 * Cloudflare POSTs here when a video changes state (ready / error).
 * No auth.uid is available — this is a system-driven write, so we use
 * the service-role client. Signature MUST be verified before any DB write.
 *
 * Header: Webhook-Signature: time=<unix>,sig1=<hex-hmac-sha256>
 * Signature is HMAC-SHA256 over `${time}.${rawBody}` with
 * CLOUDFLARE_STREAM_WEBHOOK_SECRET. The raw body string is required —
 * JSON.stringify(parsed) does not reproduce the signed bytes.
 *
 * We forward updates to BOTH listing_videos and community_videos because
 * Cloudflare doesn't tell us which table the cf_video_id belongs to.
 * cf_video_id is unique within each table; only one update will match.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StreamWebhookPayload {
  uid?: string;
  readyToStream?: boolean;
  status?: {
    state?: 'inprogress' | 'ready' | 'error' | 'queued' | 'pendingupload';
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  duration?: number;
}

export async function POST(req: Request) {
  // Read raw body BEFORE parsing — signature is over the exact bytes.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('webhook-signature');

  let valid = false;
  try {
    valid = await verifyWebhookSignature({ rawBody, signatureHeader });
  } catch (err) {
    // Missing secret env or other server misconfiguration. Don't leak details.
    console.error('webhook signature verification threw', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const videoId = payload.uid;
  if (!videoId) {
    return NextResponse.json({ ok: false, error: 'missing uid' }, { status: 400 });
  }

  // Map Cloudflare state → our 3-value status enum.
  const cfState = payload.status?.state;
  let status: 'processing' | 'ready' | 'error';
  if (cfState === 'ready' || payload.readyToStream === true) {
    status = 'ready';
  } else if (cfState === 'error') {
    status = 'error';
  } else {
    // inprogress / queued / pendingupload — leave as processing, no-op.
    return NextResponse.json({ ok: true, skipped: 'still processing' });
  }

  const duration_sec =
    typeof payload.duration === 'number' && payload.duration > 0
      ? Math.round(payload.duration)
      : null;

  // Cost guard (task 2.5): server-side belt-and-suspenders. We already pass
  // maxDurationSeconds=600 to the Stream API at upload-creation time, so CF
  // should reject overlong videos. Enforce it again here in case CF ever
  // delivers a 'ready' event for a video longer than our cap (10min + 5s slack
  // for rounding). Force status='error' so the row never serves an oversized
  // asset.
  if (status === 'ready' && duration_sec !== null && duration_sec > 605) {
    status = 'error';
    console.warn(
      `webhook: forcing status=error for cf_video_id=${videoId} duration=${duration_sec}s exceeds 10min cap`,
    );
  }

  const update: Record<string, unknown> = { status };
  if (duration_sec !== null) update.duration_sec = duration_sec;

  const supabase = createServiceClient();

  // Update both tables; only one will have a matching row (cf_video_id is
  // unique within each table). If neither matches, log and 200 — Cloudflare
  // retries on non-2xx, and we don't want infinite retries on a stale row.
  // biome-ignore lint/suspicious/noExplicitAny: database.types.ts is a Phase 0 stub; regen at phase-end via `pnpm db:types`.
  const sb = supabase as any;
  const [listingRes, communityRes] = await Promise.all([
    sb.from('listing_videos').update(update).eq('cf_video_id', videoId).select('id'),
    sb.from('community_videos').update(update).eq('cf_video_id', videoId).select('id'),
  ]);

  const matched = (listingRes.data?.length ?? 0) + (communityRes.data?.length ?? 0);
  if (matched === 0) {
    console.warn(`webhook: no row matched cf_video_id=${videoId}`);
  }

  return NextResponse.json({ ok: true, matched });
}
