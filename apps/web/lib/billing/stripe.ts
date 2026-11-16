/**
 * Stripe over plain fetch — the three calls billing makes (customers,
 * checkout sessions, billing-portal sessions) and webhook signature checks.
 * No SDK: Stripe's REST API is form-encoded and small enough here that a
 * 100-line client is easier to read than a dependency. Server-only; the
 * secret key must never reach a browser bundle.
 *
 * Webhook signature (Stripe docs, "Verify signatures manually"):
 *   Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>…][,v0=…]
 *   v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Several v1 values appear
 *   while a secret is being rolled; any one matching is enough.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

type FormValue = string | number | boolean | null | undefined | FormObject | FormValue[];
interface FormObject {
  [key: string]: FormValue;
}

/** Stripe's bracket encoding: `{ a: { b: 1 }, c: [x] }` → `a[b]=1&c[0]=x`. */
export function encodeForm(params: FormObject): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: FormValue): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}[${k}]` : k, v);
    } else {
      out.append(prefix, String(value));
    }
  };
  walk('', params);
  return out.toString();
}

export async function stripeRequest(
  method: 'GET' | 'POST',
  path: string,
  params?: FormObject,
  opts?: { idempotencyKey?: string },
): Promise<unknown> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');

  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = params ? encodeForm(params) : '';
    if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body, cache: 'no-store' });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error?: { message?: unknown } }).error?.message ?? res.statusText)
        : res.statusText;
    throw new StripeError(message, res.status);
  }
  return json;
}

export async function verifyStripeSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSec?: number;
  nowSec?: number;
}): Promise<boolean> {
  const { rawBody, signatureHeader, secret } = opts;
  if (!signatureHeader) return false;
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);

  let time: string | undefined;
  const sigs: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') time = v;
    else if (k === 'v1') sigs.push(v);
  }
  if (!time || !/^\d+$/.test(time) || sigs.length === 0) return false;
  if (Math.abs(now - Number(time)) > tolerance) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${time}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return sigs.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
