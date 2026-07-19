import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/cloudflare/stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-secret-do-not-use-in-prod';

function signHeader(time: number, body: string, secret = SECRET): string {
  const hmac = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex');
  return `time=${time},sig1=${hmac}`;
}

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: must actually unset env var; assigning undefined leaves the key present
    delete process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
    vi.useRealTimers();
  });

  it('accepts a valid signature', async () => {
    const body = JSON.stringify({ uid: 'abc', readyToStream: true });
    const time = Math.floor(Date.now() / 1000);
    const header = signHeader(time, body);
    expect(await verifyWebhookSignature({ rawBody: body, signatureHeader: header })).toBe(true);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify({ uid: 'abc' });
    const time = Math.floor(Date.now() / 1000);
    const header = `time=${time},sig1=deadbeef${'0'.repeat(56)}`;
    expect(await verifyWebhookSignature({ rawBody: body, signatureHeader: header })).toBe(false);
  });

  it('rejects when signed with the wrong secret', async () => {
    const body = JSON.stringify({ uid: 'abc' });
    const time = Math.floor(Date.now() / 1000);
    const header = signHeader(time, body, 'wrong-secret');
    expect(await verifyWebhookSignature({ rawBody: body, signatureHeader: header })).toBe(false);
  });

  it('rejects a stale timestamp (>5min skew)', async () => {
    const body = JSON.stringify({ uid: 'abc' });
    const stale = Math.floor(Date.now() / 1000) - 600; // 10min old
    const header = signHeader(stale, body);
    expect(await verifyWebhookSignature({ rawBody: body, signatureHeader: header })).toBe(false);
  });

  it('rejects a missing header', async () => {
    expect(await verifyWebhookSignature({ rawBody: '{}', signatureHeader: null })).toBe(false);
  });

  it('rejects a malformed header (no time/sig1)', async () => {
    expect(await verifyWebhookSignature({ rawBody: '{}', signatureHeader: 'garbage' })).toBe(false);
  });

  it('detects body tampering (signature was computed over different bytes)', async () => {
    const time = Math.floor(Date.now() / 1000);
    const original = JSON.stringify({ uid: 'abc', readyToStream: false });
    const tampered = JSON.stringify({ uid: 'abc', readyToStream: true });
    const header = signHeader(time, original);
    expect(await verifyWebhookSignature({ rawBody: tampered, signatureHeader: header })).toBe(
      false,
    );
  });

  it('throws when the secret is not configured', async () => {
    // biome-ignore lint/performance/noDelete: must actually unset env var
    delete process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
    const time = Math.floor(Date.now() / 1000);
    await expect(
      verifyWebhookSignature({ rawBody: '{}', signatureHeader: `time=${time},sig1=abc` }),
    ).rejects.toThrow(/CLOUDFLARE_STREAM_WEBHOOK_SECRET/);
  });
});
