/**
 * Role detection helpers (Phase 15.1).
 *
 * Buyer accounts (Phase 15.1) live in `public.buyers`; agent accounts
 * in `public.agents`. Each user has at most one row across the two.
 *
 * `getUserRole` returns 'agent' | 'buyer' | null based on which table
 * holds a row for the given auth.uid(). Used after sign-in/sign-up to
 * route the user to the right landing page.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Role = 'agent' | 'buyer';

// biome-ignore lint/suspicious/noExplicitAny: Database stub generic; see lib/supabase types TODO.
type AnyClient = SupabaseClient<any, any, any, any, any>;

export async function getUserRole(supabase: AnyClient, userId: string): Promise<Role | null> {
  const [agent, buyer] = await Promise.all([
    supabase.from('agents').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('buyers')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(
        (r) => r,
        // buyers table may not be migrated yet on local/preview; treat as null.
        () => ({ data: null, error: null }),
      ),
  ]);
  if (agent?.data) return 'agent';
  if (buyer?.data) return 'buyer';
  return null;
}

/**
 * Default landing path for a given role. Agents go to their dashboard;
 * buyers go to /profile (their main control surface in V1) — saved
 * listings and messaging come in Phase 15.2/15.3.
 */
export function defaultLandingForRole(role: Role | null): string {
  if (role === 'agent') return '/dashboard';
  if (role === 'buyer') return '/profile';
  return '/profile';
}
