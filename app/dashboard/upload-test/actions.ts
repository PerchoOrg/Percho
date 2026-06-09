'use server';

/**
 * Server actions for the /dashboard/upload-test page.
 *
 * Phase 3.1 helper: `publishPhase3Demo` flips the agent's reserved
 * `__upload_test__` listing to `published` with the minimum field set
 * required for the public route to render. Phase 4 listings CRUD will
 * delete this action and the placeholder rows in one cleanup pass.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const TEST_LISTING_SLUG = '__upload_test__';

export type PublishResult = { ok: true; publicUrl: string } | { ok: false; error: string };

export async function publishPhase3Demo(): Promise<PublishResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string; slug: string } | null };
  if (!agent) return { ok: false, error: 'no agent row' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error: updErr } = (await (supabase as any)
    .from('listings')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      address: '123 Demo Street',
      city: 'Atlanta',
      state: 'GA',
      zip: '30305',
      price: 1250000,
      beds: 4,
      baths: 3,
      sqft: 3200,
    })
    .eq('agent_id', agent.id)
    .eq('slug', TEST_LISTING_SLUG)) as { error: unknown };

  if (updErr) {
    console.error('[publishPhase3Demo] update failed', updErr);
    return { ok: false, error: 'update failed' };
  }

  const publicUrl = `/v/${agent.slug}/${TEST_LISTING_SLUG}`;
  revalidatePath(publicUrl);
  return { ok: true, publicUrl };
}
