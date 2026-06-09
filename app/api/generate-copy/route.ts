/**
 * POST /api/generate-copy — generate a 3-paragraph English listing description
 * via Anthropic. Phase 6.1b.
 *
 * Auth: requires a logged-in agent (uses anon-cookie client to read auth, then
 * resolves agent_id by user_id). RLS is irrelevant here — we don't query
 * tenant data, we just need to know who's calling for rate-limit accounting.
 *
 * Rate limit: `RATE_LIMIT_PER_MIN` per agent per kind via `ai_usage_log`.
 *
 * The Anthropic call goes through `lib/ai/anthropic.ts` (Phase 0 seam — model
 * pin + max_tokens cap live there). We deliberately accept listing fields in
 * the request body rather than reading from the listings table: the edit form
 * has unsaved local state, and the agent should be able to preview copy
 * before persisting field changes. Server-side trust boundary is rate-limit +
 * auth, not field validation against persisted state.
 */

import { generateListingCopy } from '@/lib/ai/anthropic';
import { checkAndRecord } from '@/lib/ai/rate-limit';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const Input = z.object({
  address: z.string().trim().min(1).max(200),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(40),
  price: z.number().int().nonnegative().optional(),
  beds: z.number().nonnegative().optional(),
  baths: z.number().nonnegative().optional(),
  sqft: z.number().int().nonnegative().optional(),
  style: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const agentLookup = await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const agentId = (agentLookup.data as { id: string } | null)?.id;
  if (!agentId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const limit = await checkAndRecord(service, agentId, 'listing_copy');
  if (!limit.ok) {
    if (limit.reason === 'rate_limited') {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  try {
    const paragraphs = await generateListingCopy(parsed.data);
    return NextResponse.json({ paragraphs }, { status: 200 });
  } catch (err) {
    console.error('[generate-copy] anthropic call failed', err);
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
}
