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
 * Phase 36 (2026-06-18): unified IA. The "Preview as buyer" mode is gone —
 * agents already share the buyer's nav. The community pre-fetch for the
 * old agent FAB also moved to <AgentFloatingNewWrapper>.
 *
 * Mounted in the root layout so it appears on every route. The client
 * component itself decides whether to render based on pathname (feed, auth
 * routes, and landing are excluded).
 */

import { createClient } from '@/lib/supabase/server';
import { BottomNav, type ViewerRole } from './BottomNav';

export async function BottomNavWrapper() {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) vs getUser() round-trip (~150ms).
  // Middleware re-validates on each request — chrome doesn't need fresh JWT validation.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  let role: ViewerRole = 'anon';
  if (user) {
    // biome-ignore lint/suspicious/noExplicitAny: agents typing not in stub yet
    const { data: agent } = (await (supabase as any)
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()) as { data: { id: string } | null };
    role = agent ? 'agent' : 'buyer';
  }

  return <BottomNav role={role} />;
}
