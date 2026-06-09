'use server';

/**
 * Server actions for the listing edit page (Phase 4.3a — metadata fields).
 *
 * Address/city/state/zip/lat/lng/neighborhood are intentionally NOT editable
 * here. Re-editing the address would invalidate the slug and break any
 * already-shared `/v/<agent>/<slug>` links. If a listing is wrong-addressed,
 * archive it and create a fresh one. (Phase 4.7 covers archive.)
 *
 * What this file owns:
 *  - `updateListing(id, input)` — patches mutable metadata fields.
 *  - description is stored as text[] (one element per paragraph). The form
 *    sends a single string; we split on blank lines and trim/empty-filter.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const UpdateListingInput = z.object({
  price: z.number().int().nonnegative().nullable(),
  beds: z.number().nonnegative().nullable(),
  baths: z.number().nonnegative().nullable(),
  sqft: z.number().int().nonnegative().nullable(),
  year_built: z.number().int().min(1800).max(2100).nullable(),
  lot_size: z.string().max(40).nullable(),
  hoa: z.string().max(80).nullable(),
  style: z.string().max(80).nullable(),
  description: z.string().max(20000),
});

export type UpdateListingInput = z.infer<typeof UpdateListingInput>;
export type UpdateListingResult = { ok: true } | { ok: false; error: string };

function descriptionToParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 10);
}

export async function updateListing(
  id: string,
  input: UpdateListingInput,
): Promise<UpdateListingResult> {
  const parsed = UpdateListingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // RLS policy "agent manages own listings" enforces ownership; we just send
  // the update through. If it's not the agent's row, rowcount is 0.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error, count } = (await (supabase as any)
    .from('listings')
    .update({
      price: data.price,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft,
      year_built: data.year_built,
      lot_size: emptyToNull(data.lot_size),
      hoa: emptyToNull(data.hoa),
      style: emptyToNull(data.style),
      description: descriptionToParagraphs(data.description),
    })
    .eq('id', id)
    .select('id', { count: 'exact', head: true })) as {
    error: { message?: string } | null;
    count: number | null;
  };

  if (error) {
    console.error('[updateListing] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  if ((count ?? 0) === 0) return { ok: false, error: 'not_found_or_forbidden' };

  revalidatePath(`/dashboard/listings/${id}/edit`);
  return { ok: true };
}

function emptyToNull(s: string | null): string | null {
  if (s === null) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}
