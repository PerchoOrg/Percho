/**
 * Tiny in-process registry used by the edit page so PublishPanel can flush
 * any pending auto-save in EditListingForm before calling publishListing.
 *
 * Both components are 'use client' and live on the same page, so a shared
 * module-level mutable ref is the simplest option (no context provider, no
 * lifted state through the server component parent).
 *
 * The registered function MUST resolve only after the in-flight save (if any)
 * has settled. If no edits are pending, it should resolve immediately.
 */

type Flusher = () => Promise<void>;

let flusher: Flusher | null = null;

export function registerFlush(fn: Flusher): () => void {
  flusher = fn;
  return () => {
    if (flusher === fn) flusher = null;
  };
}

export async function flushPending(): Promise<void> {
  if (flusher) await flusher();
}
