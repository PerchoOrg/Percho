/**
 * Address → MLS listing autofill.
 *
 * Public entry point used by `POST /api/mls/autofill`. Guards against
 * missing credentials so the UI can degrade gracefully today (before
 * the broker completes Bridge / FMLS approval).
 *
 * MVP does NOT mirror media — we return the Bridge CDN URLs directly
 * for the client to hotlink. See docs/mls-integration/README.md for
 * the mirroring decision.
 */

import { BridgeApiError, BridgeClient, hasBridgeCredentials } from './bridge-client';
import { type NormalizedListing, normalizeReso } from './reso-types';

export type AutofillReason =
  | 'found'
  | 'not_in_fmls'
  | 'ambiguous'
  | 'api_error'
  | 'no_credentials';

export interface AutofillAddressInput {
  street: string; // "123 Peachtree St NE"
  city: string;
  state: string;
  zip: string;
}

export type AutofillResult =
  | { reason: 'found'; listing: NormalizedListing }
  | { reason: 'not_in_fmls' | 'no_credentials' }
  | { reason: 'ambiguous'; candidates: NormalizedListing[] }
  | { reason: 'api_error'; message: string };

interface ParsedStreet {
  number: string;
  name: string;
}

/**
 * Split "123 Peachtree St NE" → { number: "123", name: "Peachtree St NE" }.
 * Falls back to number="", name=<full> if the leading token isn't numeric.
 * Bridge's `StreetName` field typically includes suffix + directional, so
 * we don't try to further split them here — an exact match on the whole
 * remainder gives the best hit rate against FMLS's canonical form.
 */
function parseStreet(street: string): ParsedStreet {
  const trimmed = street.trim();
  const m = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!m || !m[1] || !m[2]) return { number: '', name: trimmed };
  return { number: m[1], name: m[2] };
}

export async function autofillListingByAddress(
  address: AutofillAddressInput,
): Promise<AutofillResult> {
  if (!hasBridgeCredentials()) {
    return { reason: 'no_credentials' };
  }

  const { number, name } = parseStreet(address.street);
  if (!number || !name) {
    // Can't build a useful RESO filter without both parts.
    return { reason: 'not_in_fmls' };
  }

  const client = new BridgeClient();

  try {
    const hits = await client.searchByAddress(
      number,
      name,
      address.city,
      address.state,
      address.zip,
    );

    // Filter out listings the seller opted out of internet display. IDX
    // rules: `InternetEntireListingDisplayYN=false` MUST be excluded.
    const displayable = hits.filter((h) => h.InternetEntireListingDisplayYN !== false);
    if (displayable.length === 0) return { reason: 'not_in_fmls' };

    if (displayable.length === 1) {
      const only = displayable[0];
      // biome-ignore lint/style/noNonNullAssertion: length===1 guarantees index 0
      const media = await client.getMedia(only!.ListingKey);
      // biome-ignore lint/style/noNonNullAssertion: length===1 guarantees index 0
      return { reason: 'found', listing: normalizeReso(only!, media) };
    }

    // Ambiguous — return normalized shells (no media fetch to save quota).
    return {
      reason: 'ambiguous',
      candidates: displayable.map((p) => normalizeReso(p, [])),
    };
  } catch (err) {
    const message = err instanceof BridgeApiError ? `bridge_${err.status}` : 'unknown';
    console.error('[autofill] api error', message);
    return { reason: 'api_error', message };
  }
}
