/**
 * BottomNavWrapper — Server Component that resolves the viewer role
 * (anon / buyer / agent) and renders <BottomNav>.
 *
 * Role resolution (V1):
 *   - No Supabase session → 'anon'
 *   - Session + a row in `agents` for this user → 'agent'
 *   - Session but no agents row → 'buyer'
 *     (V1 has no buyer table yet — Phase 9.5. Anyone authenticated who isn't
 *     an agent is treated as a buyer for nav purposes.)
 *
 * Mounted in the root layout so it appears on every route. The client
 * component itself decides whether to render based on pathname (feed, auth
 * routes, and landing are excluded).
 */

import { createClient } from '@/lib/supabase/server';
import { isPreviewingAsBuyer } from '@/lib/auth/preview';
import { BottomNav, type ViewerRole } from './BottomNav';

export async function BottomNavWrapper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: ViewerRole = 'anon';
  if (user) {
    // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet (TODO phase1-end db:types)
    const { data: agent } = (await (supabase as any)
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()) as { data: { id: string } | null };
    role = agent ? 'agent' : 'buyer';
  }

  // Phase 27.3: agents previewing as buyer see the buyer nav.
  if (role === 'agent' && (await isPreviewingAsBuyer())) {
    role = 'buyer';
  }

  // Phase 35: prefetch communities for the agent FAB picker so "Add Community
  // Video" can pop a picker sheet instead of dumping the agent on the list
  // page. V1: globally readable, capped at 50 by name. Agents with more can
  // still hit "Browse all communities" to fall through to the list page.
  let communities: { id: string; name: string; city: string | null; state: string }[] = [];
  if (role === 'agent') {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data } = (await (supabase as any)
      .from('communities')
      .select('id, name, city, state')
      .order('name', { ascending: true })
      .limit(50)) as {
      data: { id: string; name: string; city: string | null; state: string }[] | null;
    };
    communities = data ?? [];
  }

  return <BottomNav role={role} communities={communities} />;
}
