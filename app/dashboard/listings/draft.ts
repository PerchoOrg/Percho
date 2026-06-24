/**
 * Tiny helper module shared by the create-stub flow and the edit form.
 *
 * Lives outside the `'use server'` boundary so we can export plain values
 * (the prefix constant, the synchronous `isDraftAddress` predicate)
 * alongside the server action without violating the use-server contract.
 */

export const DRAFT_ADDRESS_PREFIX = '__draft__-';

export function isDraftAddress(address: string | null | undefined): boolean {
  return !!address && address.startsWith(DRAFT_ADDRESS_PREFIX);
}
