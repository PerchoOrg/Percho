/**
 * SiteHeaderWrapper — Server Component that resolves the viewer role
 * (anon / buyer / agent) plus a display name + initial + avatar URL,
 * then renders <SiteHeader> on desktop (md+).
 *
 * Phase 27 (2026-06-14): also fetch agent.headshot_url / buyer.avatar_url
 * so the desktop avatar matches the user's chosen avatar.
 * Phase 36 (2026-06-18): unified IA — agent and buyer share one nav.
 * Removed the "preview as buyer" cookie branch; agents now see agent
 * affordances inline (Dashboard / + New) inside the avatar dropdown.
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

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, name, brokerage, headshot_url')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: {
      id: string;
      name: string | null;
      brokerage: string | null;
      headshot_url: string | null;
    } | null;
  };

  if (agent) {
    const source = agent.name?.trim() || user.email?.trim() || '?';
    return (
      <SiteHeader
        role="agent"
        initial={source.charAt(0) || '?'}
        displayName={agent.name?.trim() || user.email || null}
        brokerage={agent.brokerage}
        avatarUrl={agent.headshot_url}
      />
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: buyers typing not in stub yet
  const { data: buyer } = (await (supabase as any)
    .from('buyers')
    .select('display_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: { display_name: string | null; avatar_url: string | null } | null;
  };

  const source = buyer?.display_name?.trim() || user.email?.trim() || '?';
  const role: ViewerRole = 'buyer';
  return (
    <SiteHeader
      role={role}
      initial={source.charAt(0) || '?'}
      displayName={buyer?.display_name?.trim() || user.email || null}
      brokerage={null}
      avatarUrl={buyer?.avatar_url ?? null}
    />
  );
}
