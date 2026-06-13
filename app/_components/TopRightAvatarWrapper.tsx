/**
 * TopRightAvatarWrapper — Server Component that resolves auth state +
 * a sensible initial letter for the avatar, then renders <TopRightAvatar>.
 *
 * V1 sourcing for the initial letter:
 *   - agent → first letter of `agents.name`
 *   - buyer → first letter of email local-part
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
    .select('name')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { name: string | null } | null };

  const source = agent?.name?.trim() || user.email?.trim() || '?';
  const initial = source.charAt(0) || '?';

  return <TopRightAvatar authed={true} initial={initial} />;
}
