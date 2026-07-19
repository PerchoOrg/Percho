/**
 * Viewer resolver — cookie-bound Supabase session → agents.id.
 *
 * extracted from `app/(public)/search/page.tsx` so
 * every server surface that wants to scope inactive-community visibility to
 * the owner can share one implementation. Uses `getSession()` (cookie read,
 * ~5ms) rather than `getUser()` — middleware already validates the JWT on
 * `/dashboard/*` and other protected paths; this is defense-in-depth, not
 * the auth boundary.
 */

import { createClient } from '@/lib/supabase/server';

export async function getViewerAgentId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return null;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  return agent?.id ?? null;
}
