/**
 * SiteHeaderWrapper — Server Component that resolves the viewer role
 * (anon / buyer / agent) plus a display name + initial for the avatar,
 * then renders <SiteHeader> on desktop (md+).
 *
 * Phase 26 (2026-06-14). Mirrors BottomNavWrapper / TopRightAvatarWrapper:
 * one server-side DB hit per request to look up the agent row.
 */

import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from './SiteHeader';
import type { ViewerRole } from './nav-config';

export async function SiteHeaderWrapper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SiteHeader role="anon" initial="" displayName={null} brokerage={null} />;
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet (TODO phase1-end db:types)
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, name, brokerage')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: { id: string; name: string | null; brokerage: string | null } | null;
  };

  const role: ViewerRole = agent ? 'agent' : 'buyer';
  const source = agent?.name?.trim() || user.email?.trim() || '?';
  const initial = source.charAt(0) || '?';
  const displayName = agent?.name?.trim() || user.email || null;
  const brokerage = agent?.brokerage ?? null;

  return (
    <SiteHeader role={role} initial={initial} displayName={displayName} brokerage={brokerage} />
  );
}
