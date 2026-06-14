/**
 * TopRightAvatarWrapper — Server Component that resolves auth state +
 * a sensible initial letter + optional avatar URL, then renders <TopRightAvatar>.
 *
 * V1 sourcing:
 *   - agent → first letter of `agents.name`, avatar from `agents.headshot_url`
 *   - buyer → first letter of email local-part, avatar from `buyers.avatar_url`
 *   - anon  → empty (renders "Sign in" pill)
 */

import { createClient } from '@/lib/supabase/server';
import { TopRightAvatar } from './TopRightAvatar';

export async function TopRightAvatarWrapper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <TopRightAvatar authed={false} initial="" />;
  }

  // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('name, headshot_url')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { name: string | null; headshot_url: string | null } | null };

  if (agent) {
    const source = agent.name?.trim() || user.email?.trim() || '?';
    return (
      <TopRightAvatar
        authed={true}
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
    <TopRightAvatar
      authed={true}
      initial={source.charAt(0) || '?'}
      avatarUrl={buyer?.avatar_url ?? null}
    />
  );
}
