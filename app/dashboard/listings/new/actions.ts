'use server';

/**
 * Server action for creating a new draft listing.
 *
 * Inputs come from NewListingForm — Place Details has already been resolved
 * client-side, so we receive parsed components (city/state/zip/lat/lng) plus
 * raw price/beds/baths/sqft. We re-validate everything with zod (never trust
 * the client) and insert a draft row, then redirect to the edit page.
 */

import { deriveSlug, nextCandidate } from '@/lib/listings/slug';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// Form-shaped input. Diverges slightly from `ListingCreate` in lib/zod/schemas:
// - slug is server-derived from address (not user-entered)
// - lat/lng are required (Place Details guarantees them)
// - description/community_id deferred to the edit page (Phase 4.3)
const NewListingInput = z.object({
  address: z.string().min(3).max(200),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  zip: z.string().max(10).optional().nullable(),
  neighborhood: z.string().max(120).optional().nullable(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  place_id: z.string().min(1).max(255).optional().nullable(),
  price: z.number().int().positive().nullable().optional(),
  beds: z.number().nonnegative().nullable().optional(),
  baths: z.number().nonnegative().nullable().optional(),
  sqft: z.number().int().positive().nullable().optional(),
});

export type CreateListingInput = z.infer<typeof NewListingInput>;

export type CreateListingResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const MAX_SLUG_ATTEMPTS = 20;

export async function createListing(input: CreateListingInput): Promise<CreateListingResult> {
  const parsed = NewListingInput.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    console.error('[createListing] invalid_input', {
      fieldErrors: flat.fieldErrors,
      // Log the input shape (not values that might leak PII) for debugging.
      hasCity: Boolean(input.city),
      hasState: Boolean(input.state),
      hasLat: typeof input.lat === 'number',
      hasLng: typeof input.lng === 'number',
    });
    return {
      ok: false,
      error: 'invalid_input',
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!agent) return { ok: false, error: 'no_agent_row' };

  const baseSlug = deriveSlug(data.address);

  // Try base, base-2, base-3, ... until insert succeeds. Postgres unique
  // constraint `(agent_id, slug)` means we get a 23505 on collision.
  let lastErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = nextCandidate(baseSlug, attempt);
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: created, error } = (await (supabase as any)
      .from('listings')
      .insert({
        agent_id: agent.id,
        slug,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip ?? null,
        neighborhood: data.neighborhood ?? null,
        lat: data.lat,
        lng: data.lng,
        price: data.price ?? null,
        beds: data.beds ?? null,
        baths: data.baths ?? null,
        sqft: data.sqft ?? null,
        status: 'draft',
      })
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (created) {
      redirect(`/dashboard/listings/${created.id}/edit`);
    }
    lastErr = error;
    // 23505 = unique_violation; loop with next suffix. Anything else aborts.
    if (error && error.code !== '23505') {
      console.error('[createListing] insert failed', error);
      return { ok: false, error: 'insert_failed' };
    }
  }

  console.error('[createListing] slug exhaustion', { baseSlug, lastErr });
  return { ok: false, error: 'slug_exhaustion' };
}
