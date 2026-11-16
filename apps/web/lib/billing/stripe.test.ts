import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeForm, verifyStripeSignature } from './stripe';

const SECRET = 'whsec_test_fixture';
const BODY = '{"id":"evt_1","type":"checkout.session.completed"}';
const sign = (t: number, body = BODY, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

describe('encodeForm', () => {
  it('uses Stripe bracket notation for objects and arrays', () => {
    const out = new URLSearchParams(
      encodeForm({
        mode: 'subscription',
        line_items: [{ price: 'price_1', quantity: 1 }],
        metadata: { partnership_id: 'p1' },
        skipped: undefined,
        none: null,
      }),
    );
    expect([...out.entries()]).toEqual([
      ['mode', 'subscription'],
      ['line_items[0][price]', 'price_1'],
      ['line_items[0][quantity]', '1'],
      ['metadata[partnership_id]', 'p1'],
    ]);
  });
});

describe('verifyStripeSignature', () => {
  const now = 1_800_000_000;
  const check = (header: string | null, body = BODY) =>
    verifyStripeSignature({ rawBody: body, signatureHeader: header, secret: SECRET, nowSec: now });

  it('accepts a correct v1 signature', async () => {
    expect(await check(`t=${now},v1=${sign(now)}`)).toBe(true);
  });

  it('accepts any matching v1 while a secret is being rolled', async () => {
    const old = sign(now, BODY, 'whsec_old');
    expect(await check(`t=${now},v1=${old},v1=${sign(now)},v0=abc`)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    expect(await check(`t=${now},v1=${sign(now)}`, `${BODY} `)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', async () => {
    const t = now - 301;
    expect(await check(`t=${t},v1=${sign(t)}`)).toBe(false);
  });

  it('rejects a missing or malformed header', async () => {
    expect(await check(null)).toBe(false);
    expect(await check('v1=abc')).toBe(false);
    expect(await check(`t=${now}`)).toBe(false);
    expect(await check(`t=${now},v0=${sign(now)}`)).toBe(false);
  });
});
