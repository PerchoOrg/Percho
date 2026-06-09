/**
 * Per-agent rate limit for AI generation routes (Phase 6.1b).
 *
 * Strategy: count rows in `ai_usage_log` for (agent_id, kind) within the last
 * minute. If the count is at the cap, reject. Otherwise insert a marker row
 * and return ok.
 *
 * Race conditions are tolerable: two concurrent requests can both pass the
 * count check and both insert, briefly exceeding the cap by 1. That's fine —
 * we want a soft ceiling against UI spam, not a billing meter. If/when this
 * matters we'd switch to a Postgres advisory lock or a sliding-window
 * function; not warranted today.
 *
 * The check uses a HEAD request with `count: 'exact'` so we don't drag rows
 * across the wire. Insert is the smallest possible row.
 *
 * Caller responsibilities:
 *   - Pass a service-role client (RLS gates SELECT to own rows; service role
 *     also lets us INSERT, since there is no anon/authed insert policy).
 *   - Resolve `agent_id` from the authenticated user *before* calling here,
 *     so we never count against the wrong agent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RateLimitKind = 'listing_copy' | 'social_copy';

export const RATE_LIMIT_PER_MIN = 10;

export type RateLimitResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'internal' };

export async function checkAndRecord(
  supabase: SupabaseClient,
  agentId: string,
  kind: RateLimitKind,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const since = new Date(now.getTime() - 60_000).toISOString();

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const countRes = await (supabase as any)
    .from('ai_usage_log')
    .select('id', { head: true, count: 'exact' })
    .eq('agent_id', agentId)
    .eq('kind', kind)
    .gt('created_at', since);

  if (countRes.error) {
    return { ok: false, reason: 'internal' };
  }
  if ((countRes.count ?? 0) >= RATE_LIMIT_PER_MIN) {
    return { ok: false, reason: 'rate_limited' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const ins = await (supabase as any).from('ai_usage_log').insert({ agent_id: agentId, kind });
  if (ins.error) {
    return { ok: false, reason: 'internal' };
  }
  return { ok: true };
}
