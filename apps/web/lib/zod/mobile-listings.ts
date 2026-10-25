/**
 * The `listings` query flag on the mobile feed, search and map endpoints.
 *
 * iOS v1.0 ships without home listings (DEVLOG phase308) and sends
 * `listings=0`; the endpoints then read no listing rows at all, so no listing
 * data or listing photo is in the response. Anything else — including no flag,
 * which is every build before v1.0 — means listings as before, so the
 * TestFlight builds already on phones keep working.
 *
 * The web app never calls these endpoints, so the flag cannot change a web page.
 */

import { z } from 'zod';

export const mobileListingsFlagSchema = z
  .enum(['0', '1'])
  .catch('1')
  .transform((v) => v === '1');

/** `true` unless the request carries `listings=0`. */
export function parseMobileListingsFlag(url: URL): boolean {
  return mobileListingsFlagSchema.parse(url.searchParams.get('listings') ?? '1');
}
