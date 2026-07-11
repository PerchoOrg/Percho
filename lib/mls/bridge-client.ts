/**
 * BridgeClient — thin RESO Web API transport for Bridge Interactive
 * (bridgedataoutput.com), the official RESO endpoint for FMLS.
 *
 * This module is transport-only: it builds URLs, adds auth, retries on
 * 429/5xx, and returns parsed JSON. It does NOT touch Supabase and does
 * NOT know about Percho's normalized shape (see reso-types.ts).
 *
 * Auth: Bridge server-token, header `Authorization: Bearer <token>`.
 * The token identifies both the caller and which dataset(s) they can
 * read; we still pass a datasetId in the path per Bridge's URL scheme.
 *
 * Rate limits: Bridge documents ~200 req/min per token on the standard
 * plan. We handle 429 via Retry-After (seconds) with exponential
 * fallback if the header is missing, capped at 5 attempts total.
 */

import type { ODataFilter, ResoMedia, ResoProperty } from './reso-types';

interface BridgeConfig {
  serverToken: string;
  datasetId: string;
  baseUrl: string;
  timeoutMs: number;
}

interface ODataListResponse<T> {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
  value: T[];
}

export class BridgeConfigError extends Error {}
export class BridgeApiError extends Error {
  public readonly status: number;
  public readonly requestId: string;
  constructor(message: string, status: number, requestId: string) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

const DEFAULT_BASE_URL = 'https://api.bridgedataoutput.com/api/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 5;

function readConfig(): BridgeConfig {
  const serverToken = process.env.BRIDGE_SERVER_TOKEN;
  const datasetId = process.env.BRIDGE_DATASET_ID;
  if (!serverToken) throw new BridgeConfigError('BRIDGE_SERVER_TOKEN is not set');
  if (!datasetId) throw new BridgeConfigError('BRIDGE_DATASET_ID is not set');
  return {
    serverToken,
    datasetId,
    baseUrl: process.env.BRIDGE_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/** Public helper — lets callers avoid throwing before any API call. */
export function hasBridgeCredentials(): boolean {
  return Boolean(process.env.BRIDGE_SERVER_TOKEN && process.env.BRIDGE_DATASET_ID);
}

/**
 * Escape a string literal for OData `eq 'value'` comparisons per OData
 * v4: single quotes are doubled. No other escaping is required for
 * ASCII string filters.
 */
export function odataEscape(v: string): string {
  return v.replace(/'/g, "''");
}

function newRequestId(): string {
  // Short, log-friendly. Not cryptographic.
  return Math.random().toString(36).slice(2, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class BridgeClient {
  private readonly config: BridgeConfig;

  constructor(config?: Partial<BridgeConfig>) {
    const base = readConfig();
    this.config = { ...base, ...config };
  }

  /**
   * "Authenticate" is a no-op for server-token auth (Bridge has no
   * OAuth handshake for server tokens). Kept as a method so callers can
   * treat auth uniformly and so we can add a token-probe request later.
   */
  authenticate(): Promise<void> {
    if (!this.config.serverToken) {
      throw new BridgeConfigError('BRIDGE_SERVER_TOKEN is not set');
    }
    return Promise.resolve();
  }

  async listProperties(
    filter?: ODataFilter,
    top = 100,
    skip = 0,
  ): Promise<ODataListResponse<ResoProperty>> {
    const params = new URLSearchParams();
    if (filter?.raw) params.set('$filter', filter.raw);
    params.set('$top', String(top));
    params.set('$skip', String(skip));
    return this.get<ODataListResponse<ResoProperty>>(`/OData/${this.config.datasetId}/Property`, params);
  }

  async getProperty(listingKey: string): Promise<ResoProperty | null> {
    const filter: ODataFilter = { raw: `ListingKey eq '${odataEscape(listingKey)}'` };
    const res = await this.listProperties(filter, 1, 0);
    return res.value[0] ?? null;
  }

  async getMedia(listingKey: string): Promise<ResoMedia[]> {
    const params = new URLSearchParams();
    params.set('$filter', `ResourceRecordKey eq '${odataEscape(listingKey)}'`);
    params.set('$top', '100');
    const res = await this.get<ODataListResponse<ResoMedia>>(
      `/OData/${this.config.datasetId}/Media`,
      params,
    );
    return res.value;
  }

  /**
   * Address search. Bridge's dataset uses discrete street fields — we
   * combine them with `and`. City/state/zip are filtered too when
   * provided (they are cheap and dramatically reduce false positives on
   * common street names). All comparisons are exact — Bridge does not
   * reliably support case-insensitive OData functions across datasets.
   */
  async searchByAddress(
    streetNumber: string,
    streetName: string,
    city: string,
    state: string,
    zip: string,
  ): Promise<ResoProperty[]> {
    const parts: string[] = [
      `StreetNumber eq '${odataEscape(streetNumber)}'`,
      `StreetName eq '${odataEscape(streetName)}'`,
    ];
    if (city) parts.push(`City eq '${odataEscape(city)}'`);
    if (state) parts.push(`StateOrProvince eq '${odataEscape(state)}'`);
    if (zip) parts.push(`PostalCode eq '${odataEscape(zip)}'`);
    const filter: ODataFilter = { raw: parts.join(' and ') };
    const res = await this.listProperties(filter, 5, 0);
    return res.value;
  }

  private async get<T>(pathname: string, params: URLSearchParams): Promise<T> {
    const url = `${this.config.baseUrl}${pathname}?${params.toString()}`;
    const requestId = newRequestId();

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.serverToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          const retryAfterHdr = res.headers.get('retry-after');
          const retryAfter = retryAfterHdr === null ? NaN : Number(retryAfterHdr);
          const waitMs = Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1000
            : Math.min(30_000, 2 ** attempt * 500);
          console.error(
            `[bridge] retryable status=${res.status} attempt=${attempt} wait=${waitMs}ms rid=${requestId}`,
          );
          if (attempt >= MAX_ATTEMPTS) {
            throw new BridgeApiError(`Bridge ${res.status} after ${attempt} attempts`, res.status, requestId);
          }
          await sleep(waitMs);
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(
            `[bridge] non-retryable status=${res.status} rid=${requestId} body=${body.slice(0, 200)}`,
          );
          throw new BridgeApiError(`Bridge ${res.status}`, res.status, requestId);
        }

        return (await res.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err instanceof BridgeApiError) throw err;
        // Network / abort — retry with backoff.
        console.error(
          `[bridge] fetch error attempt=${attempt} rid=${requestId} err=${(err as Error).message}`,
        );
        if (attempt >= MAX_ATTEMPTS) break;
        await sleep(Math.min(30_000, 2 ** attempt * 500));
      }
    }

    throw new BridgeApiError(
      `Bridge request failed: ${(lastError as Error)?.message ?? 'unknown'}`,
      0,
      requestId,
    );
  }
}
