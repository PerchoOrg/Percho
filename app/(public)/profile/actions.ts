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

const DISPLAY_NAME_MAX = 80;

export async function updateBuyerDisplayName(input: {
  displayName: string;
}): Promise<{ error: string | null }> {
  const displayName = input.displayName.trim();
  if (displayName === '') return { error: 'Display name cannot be empty.' };
  if (displayName.length > DISPLAY_NAME_MAX) {
    return { error: `Display name too long (max ${DISPLAY_NAME_MAX} chars).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // Upsert — handles legacy users who signed up before the buyers trigger.
  // RLS `buyers_self_update` covers the update path; the insert path goes
  // through handle_new_user (security definer) for new signups, but legacy
  // rows may be missing. Use a service-free upsert: if the row is missing,
  // we insert; otherwise we update.
  // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
  const { data: existing } = (await (supabase as any)
    .from('buyers')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { user_id: string } | null };

  if (existing) {
    // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
    const { error: updateErr } = await (supabase as any)
      .from('buyers')
      .update({ display_name: displayName })
      .eq('user_id', user.id);
    if (updateErr) return { error: updateErr.message };
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
    const { error: insertErr } = await (supabase as any)
      .from('buyers')
      .insert({ user_id: user.id, display_name: displayName, email: user.email });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath('/profile');
  return { error: null };
}

/**
 * Phase 27 (2026-06-14): set or clear the current user's avatar URL.
 *
 * Detects role automatically — agents write `agents.headshot_url`, buyers
 * write `buyers.avatar_url` (DB columns kept put per the migration's note).
 * Pass `url: null` to clear. The caller is responsible for having uploaded
 * the file to Storage (or for picking a `/avatars/preset-N.svg` path).
 */
export async function updateAvatarUrl(input: {
  url: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // Light validation — keep it simple; URL shape is whatever the picker
  // supplies (preset path or Supabase Storage public URL).
  const url = input.url;
  if (url !== null && (typeof url !== 'string' || url.length > 2048)) {
    return { error: 'Invalid avatar URL.' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { slug: string | null } | null };

  if (agent) {
    // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
    const { error: updateErr } = await (supabase as any)
      .from('agents')
      .update({ headshot_url: url })
      .eq('user_id', user.id);
    if (updateErr) return { error: updateErr.message };
    revalidatePath('/profile');
    if (agent.slug) revalidatePath(`/a/${agent.slug}`);
    return { error: null };
  }

  // Buyer branch — upsert because legacy users may be missing a buyers row.
  // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
  const { data: existing } = (await (supabase as any)
    .from('buyers')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { user_id: string } | null };

  if (existing) {
    // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
    const { error: updateErr } = await (supabase as any)
      .from('buyers')
      .update({ avatar_url: url })
      .eq('user_id', user.id);
    if (updateErr) return { error: updateErr.message };
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
    const { error: insertErr } = await (supabase as any)
      .from('buyers')
      .insert({ user_id: user.id, email: user.email, avatar_url: url });
    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath('/profile');
  return { error: null };
}
