'use server';

/**
 * Listing-level server actions that aren't tied to a specific [id].
 *
 * Phase 52 (2026-06-24): added `createStubListing` so the FAB → Listing
 * tile can stub a row immediately and drop the agent on the edit page,
 * mirroring `createStubCommunity` for communities. The previous flow
 * (FAB → /listings/new → fill address+price+beds+baths+sqft → submit
 * → edit page) has been deleted — those fields all live on the edit
 * page already and the new flow lets the agent fill them in any order.
 *
 * Address is NOT NULL in the schema (migration 0001) and slug must be
 * unique per agent. We can't ask for the address up front anymore, so
 * we insert with a placeholder address `__draft__-<rand>` + matching
 * slug. The edit page exposes an Address section that will run Place
 * Details and re-derive the slug + address on first save.
 *
 * Status defaults to 'inactive' (CHECK constraint after migration 0030
 * only allows 'active'|'inactive') so unfinished stubs don't leak to
 * buyers.
 */

import type { ActionResult } from '@/app/dashboard/communities/actions';
import { createClient } from '@/lib/supabase/server';
import { DRAFT_ADDRESS_PREFIX } from './draft';

export async function createStubListing(): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!agentRow) return { ok: false, error: 'no_agent_row' };

  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const placeholder = `${DRAFT_ADDRESS_PREFIX}${suffix}`;
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: created, error } = (await (supabase as any)
      .from('listings')
      .insert({
        agent_id: agentRow.id,
        slug: placeholder,
        address: placeholder,
        city: '',
        state: 'GA',
        status: 'inactive',
      })
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (!error && created) {
      return { ok: true, data: { id: created.id } };
    }
    if (error?.code !== '23505') {
      console.error('[createStubListing] insert failed', error);
      return { ok: false, error: 'insert_failed' };
    }
    // 23505 → unique (agent_id, slug) collision, retry
  }
  return { ok: false, error: 'insert_failed' };
}
