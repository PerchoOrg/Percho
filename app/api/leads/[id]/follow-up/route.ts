/**
 * POST /api/leads/[id]/follow-up — toggle followed_up_at.
 *
 * Phase 18. Body: `{ value: "now" | null }`.
 *   - "now"  → set `followed_up_at = now()` (idempotent)
 *   - null   → clear `followed_up_at` (used by the "Mark as new" detail toggle)
 *
 * Auth: Supabase server client. RLS already gates `update on leads` to leads
 * whose listing belongs to the calling agent — we don't re-check ownership
 * here. If the row isn't visible/updatable, the update affects 0 rows and
 * we return 404 (don't leak that the id exists).
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface Body {
  value?: 'now' | null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (body.value !== 'now' && body.value !== null) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const followed_up_at = body.value === 'now' ? new Date().toISOString() : null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = (await (supabase as any)
    .from('leads')
    .update({ followed_up_at })
    .eq('id', id)
    .select('id, followed_up_at')
    .maybeSingle()) as {
    data: { id: string; followed_up_at: string | null } | null;
    error: unknown;
  };

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ id: data.id, followed_up_at: data.followed_up_at });
}
