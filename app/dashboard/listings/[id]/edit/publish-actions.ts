'use server';

/**
 * Phase 46 — activate / deactivate server actions.
 *
 * Replaces the prior 3-state publish/unpublish/archive flow. Listings now
 * live in two states only: 'active' (buyer-visible) or 'inactive' (hidden).
 *
 * Validation gate before allowing status='active':
 *  - address (always present from create flow, but defensive check)
 *  - price (int, > 0)
 *  - beds (>= 0, NOT NULL — studios use 0)
 *  - baths (> 0)
 *  - >= 1 ready listing_video OR >= 1 ready listing_photo
 *
 * On activate: status='active', published_at=now() (first activation marks
 * the historical timestamp; later toggles preserve it). Revalidates the
 * public route at `/v/<agentSlug>/<listingSlug>`.
 *
 * Deactivate flips back to 'inactive' and keeps published_at intact.
 *
 * RLS does the row-ownership check (only the owning agent can update their
 * own listing). This action does NOT use the service role key.
 *
 * Function names `publishListing` / `unpublishListing` are preserved as
 * stable exports so existing imports continue to resolve; semantics are
 * activate/deactivate now.
 */

import { isDraftAddress } from '@/app/dashboard/listings/draft';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export type PublishResult = { ok: true; status: 'active' } | { ok: false; missing: string[] };

export async function publishListing(listingId: string): Promise<PublishResult> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select('id, address, price, beds, baths, agent_id, slug, published_at')
    .eq('id', listingId)
    .maybeSingle()) as {
    data: {
      id: string;
      address: string | null;
      price: number | null;
      beds: number | null;
      baths: number | null;
      agent_id: string;
      slug: string;
      published_at: string | null;
    } | null;
  };

  if (!listing) return { ok: false, missing: ['listing not found'] };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { count: readyVideoCount } = (await (supabase as any)
    .from('listing_videos')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('status', 'ready')) as { count: number | null };

  // Phase 10 (2026-06-12): photos count toward the activate gate too.
  // Either ≥1 ready video or ≥1 ready photo unblocks activation.
  // Hotfix: graceful fallback if migration 0011 is missing — count = 0
  // means activate gate falls back to "video required", matching V0 behaviour.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { count: readyPhotoCount } = (await (supabase as any)
    .from('listing_photos')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('status', 'ready')
    .then(
      (r: { count: number | null }) => r,
      () => ({ count: 0 }),
    )) as { count: number | null };

  const missing: string[] = [];
  if (!listing.address || isDraftAddress(listing.address)) missing.push('address');
  if (listing.price == null || listing.price <= 0) missing.push('price');
  if (listing.beds == null) missing.push('beds');
  if (listing.baths == null || listing.baths <= 0) missing.push('baths');
  if ((readyVideoCount ?? 0) < 1 && (readyPhotoCount ?? 0) < 1) {
    missing.push('at least one ready video or photo');
  }

  if (missing.length > 0) return { ok: false, missing };

  // Only stamp published_at on first activation; preserve subsequent toggles.
  const update: Record<string, unknown> = { status: 'active' };
  if (!listing.published_at) update.published_at = new Date().toISOString();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listings')
    .update(update)
    .eq('id', listingId);

  if (error) return { ok: false, missing: [`db: ${error.message}`] };

  // Look up agent slug for revalidation. RLS allows agents to read their own row.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('id', listing.agent_id)
    .maybeSingle()) as { data: { slug: string } | null };

  if (agent?.slug) {
    revalidatePath(`/v/${agent.slug}/${listing.slug}`);
  }
  revalidateTag('community-cards');

  return { ok: true, status: 'active' };
}

export async function unpublishListing(
  listingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select('id, agent_id, slug')
    .eq('id', listingId)
    .maybeSingle()) as { data: { id: string; agent_id: string; slug: string } | null };

  if (!listing) return { ok: false, error: 'listing not found' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listings')
    .update({ status: 'inactive' })
    .eq('id', listingId);

  if (error) return { ok: false, error: error.message };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('id', listing.agent_id)
    .maybeSingle()) as { data: { slug: string } | null };

  if (agent?.slug) {
    revalidatePath(`/v/${agent.slug}/${listing.slug}`);
  }
  revalidateTag('community-cards');

  return { ok: true };
}
