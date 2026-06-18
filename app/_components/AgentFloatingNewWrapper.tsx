/**
 * AgentFloatingNewWrapper — Server Component that decides whether to render
 * the agent's floating "+" button and pre-fetches the community picker list.
 *
 * Phase 36 (2026-06-18). Mounted in the root layout. Renders nothing for
 * non-agents. The client component itself decides per-route visibility
 * (Dashboard / Listings / Profile / Communities only — see SHOW_PREFIXES in
 * AgentFloatingNew.tsx).
 */

import { createClient } from '@/lib/supabase/server';
import { AgentFloatingNew, type CommunityChoice } from './AgentFloatingNew';

export async function AgentFloatingNewWrapper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agent) return null;

  // V1: globally readable communities, capped at 50 by name. Agents with
  // more can fall through to "Browse all" inside the picker sheet.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })
    .limit(50)) as {
    data: CommunityChoice[] | null;
  };

  return <AgentFloatingNew communities={data ?? []} />;
}
