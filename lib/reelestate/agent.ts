/**
 * fetchMobileAgent — RSC data loader for the ReelEstate mobile Agent Profile
 * screen (`/agents/[handle]`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.5
 *
 * A4.1 scope: real Supabase read of one agent by `slug` (the URL handle),
 * returning the fields the profile header renders — name, brokerage,
 * headshot_url, bio. Tabs (A4.2) and contact CTAs (A4.3) reuse the same
 * shape.
 *
 * Cache strategy follows the supabase-rsc-perf-playbook skill:
 *   - `createAnonClient()` (cookie-less) so the fetch is safe inside
 *     `unstable_cache` (no dynamic APIs).
 *   - `public reads agent profile` RLS policy (migration 0001_init) allows
 *     anon SELECT of every agent row, matching the buyer-facing screen.
 *   - Tag `mobile-agent` + per-handle key so an agent editing their own
 *     profile can `revalidateTag` this cache from a mutation later.
 *
 * No mock/seed fallback: a miss (bad slug, agent deleted) returns `null`
 * and the page 404s.
 */
import { unstable_cache } from 'next/cache';
import { createAnonClient } from '@/lib/supabase/server';

export const MOBILE_AGENT_TAG = 'mobile-agent';

export interface MobileAgent {
  id: string;
  slug: string;
  name: string;
  brokerage: string | null;
  headshot_url: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
}

interface RawAgentRow {
  id: string;
  slug: string;
  name: string;
  brokerage: string | null;
  headshot_url: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
}

async function fetchMobileAgentImpl(handle: string): Promise<MobileAgent | null> {
  const supabase = createAnonClient();

  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub
  const { data, error } = (await (supabase as any)
    .from('agents')
    .select('id, slug, name, brokerage, headshot_url, bio, phone, email')
    .eq('slug', handle)
    .maybeSingle()) as { data: RawAgentRow | null; error: unknown };

  if (error || !data) return null;
  return data;
}

export function fetchMobileAgent(handle: string): Promise<MobileAgent | null> {
  return unstable_cache(
    () => fetchMobileAgentImpl(handle),
    ['mobile-agent', handle],
    { revalidate: 60, tags: [MOBILE_AGENT_TAG] },
  )();
}
