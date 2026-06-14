'use server';

/**
 * Phase 25 (2026-06-14): Server actions for /profile.
 *
 * Currently exposes `updateAgentIdentity` — agent renames `name` and/or
 * `brokerage`. Slug is intentionally NOT updated here (frozen at signup).
 *
 * RLS: `agents updates own profile` policy on `agents` allows
 * `update where user_id = auth.uid()`, so we use the user-scoped server
 * client (no service role).
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const NAME_MAX = 80;
const BROKERAGE_MAX = 80;

export async function updateAgentIdentity(input: {
  name: string;
  brokerage: string;
}): Promise<{ error: string | null }> {
  const name = input.name.trim();
  const brokerage = input.brokerage.trim();

  if (name === '') return { error: 'Name cannot be empty.' };
  if (name.length > NAME_MAX) return { error: `Name too long (max ${NAME_MAX} chars).` };
  if (brokerage.length > BROKERAGE_MAX) {
    return { error: `Brokerage too long (max ${BROKERAGE_MAX} chars).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent, error: lookupErr } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { slug: string | null } | null; error: { message: string } | null };

  if (lookupErr) return { error: lookupErr.message };
  if (!agent) return { error: 'Agent profile not found.' };

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { error: updateErr } = await (supabase as any)
    .from('agents')
    .update({
      name,
      brokerage: brokerage === '' ? null : brokerage,
    })
    .eq('user_id', user.id);

  if (updateErr) return { error: updateErr.message };

  revalidatePath('/profile');
  if (agent.slug) revalidatePath(`/a/${agent.slug}`);

  return { error: null };
}
