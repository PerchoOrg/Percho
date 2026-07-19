/**
 * TopBarWrapper — Server Component that resolves auth state + initial letter
 * + avatar URL, then renders <TopBar>. Phase 45 (2026-06-20).
 *
 * Mirrors the prior SiteHeaderWrapper / TopRightAvatarWrapper resolution so
 * the visual avatar source (agent.headshot_url / buyer.avatar_url / initial)
 * stays consistent.
 */

import { createClient } from '@/lib/supabase/server';
import { TopBar } from './TopBar';

export async function TopBarWrapper() {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) vs getUser() round-trip (~150ms).
  // Middleware re-validates on each request — chrome doesn't need fresh JWT validation.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    return <TopBar role="anon" initial="" />;
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id, name, headshot_url')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: { id: string; name: string | null; headshot_url: string | null } | null;
  };

  if (agent) {
    const source = agent.name?.trim() || user.email?.trim() || '?';
    return (
      <TopBar
        role="agent"
        initial={source.charAt(0) || '?'}
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
  return (
    <TopBar
      role="buyer"
      initial={source.charAt(0) || '?'}
      avatarUrl={buyer?.avatar_url ?? null}
    />
  );
}
