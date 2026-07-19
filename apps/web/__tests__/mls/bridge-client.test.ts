/**
 * BridgeClient tests. No live network — `fetch` is stubbed via
 * `vi.stubGlobal`. Covers happy path, 429 backoff, missing-creds, and
 * a not-found (empty $filter result) case.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeClient, BridgeConfigError, hasBridgeCredentials } from '@/lib/mls/bridge-client';

type FetchStub = ReturnType<typeof vi.fn>;

function makeResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.headers ?? { 'content-type': 'application/json' },
  });
}

describe('BridgeClient', () => {
  beforeEach(() => {
    process.env.BRIDGE_SERVER_TOKEN = 'test-token';
    process.env.BRIDGE_DATASET_ID = 'fmls-test';
    process.env.BRIDGE_BASE_URL = 'https://api.example.test/api/v2';
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_SERVER_TOKEN;
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_DATASET_ID;
    // biome-ignore lint/performance/noDelete: env cleanup
    delete process.env.BRIDGE_BASE_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hasBridgeCredentials returns true when both env vars are set', () => {
    expect(hasBridgeCredentials()).toBe(true);
  });

  it('constructor throws when server token is missing', () => {
    // biome-ignore lint/performance/noDelete: test setup
    delete process.env.BRIDGE_SERVER_TOKEN;
    expect(() => new BridgeClient()).toThrow(BridgeConfigError);
  });

  it('listProperties: sends bearer token and parses OData response', async () => {
    const stub: FetchStub = vi.fn().mockResolvedValue(
      makeResponse({ value: [{ ListingKey: 'K1', ListPrice: 100 }] }),
    );
    vi.stubGlobal('fetch', stub);

    const client = new BridgeClient();
    const res = await client.listProperties({ raw: "City eq 'Atlanta'" }, 10, 0);

    expect(res.value).toHaveLength(1);
    expect(res.value[0]?.ListingKey).toBe('K1');

    expect(stub).toHaveBeenCalledOnce();
    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/OData/fmls-test/Property');
    expect(url).toContain('%24filter='); // urlencoded $filter
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('searchByAddress: builds a compound OData filter', async () => {
    const stub: FetchStub = vi.fn().mockResolvedValue(makeResponse({ value: [] }));
    vi.stubGlobal('fetch', stub);

    const client = new BridgeClient();
    const results = await client.searchByAddress('123', 'Peachtree St NE', 'Atlanta', 'GA', '30303');

    expect(results).toHaveLength(0);
    const [url] = stub.mock.calls[0] as [string];
    // URLSearchParams encodes spaces as '+'; normalize before asserting.
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain("StreetNumber eq '123'");
    expect(decoded).toContain("StreetName eq 'Peachtree St NE'");
    expect(decoded).toContain("City eq 'Atlanta'");
    expect(decoded).toContain("StateOrProvince eq 'GA'");
    expect(decoded).toContain("PostalCode eq '30303'");
  });

  it('retries on 429 and eventually succeeds', async () => {
    const stub: FetchStub = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ error: 'rate' }, { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(makeResponse({ value: [{ ListingKey: 'OK' }] }));
    vi.stubGlobal('fetch', stub);

    const client = new BridgeClient();
    const res = await client.listProperties(undefined, 1, 0);
    expect(stub).toHaveBeenCalledTimes(2);
    expect(res.value[0]?.ListingKey).toBe('OK');
  });

  it('escapes single quotes in address values (OData literal safety)', async () => {
    const stub: FetchStub = vi.fn().mockResolvedValue(makeResponse({ value: [] }));
    vi.stubGlobal('fetch', stub);

    const client = new BridgeClient();
    await client.searchByAddress('1', "O'Brien Rd", 'Atlanta', 'GA', '30303');

    const [url] = stub.mock.calls[0] as [string];
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain("StreetName eq 'O''Brien Rd'");
  });
});
