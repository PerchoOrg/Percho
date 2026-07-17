/**
 * requireAdmin — server-side gate for /admin/* routes.
 *
 * Uses the normal user client (RLS-scoped) to fetch the agent row for the
 * current session. If missing, returns null (caller redirects to /login).
 * If is_admin=false, returns null (caller redirects to /dashboard).
 *
 * Returns the agent row on success so the page can show "logged in as X".
 *
 * We intentionally do NOT use the service-role client here — RLS on
 * `agents` already lets a user read their own row, and forcing service
 * role would defeat the point of the RLS boundary.
 */

import { createClient } from '@/lib/supabase/server';

export interface AdminAgent {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_admin: boolean;
}

export async function requireAdmin(): Promise<AdminAgent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = (await supabase
    .from('agents')
    .select('id, user_id, name, email, is_admin')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: AdminAgent | null };

  if (!data || !data.is_admin) return null;
  return data;
}
