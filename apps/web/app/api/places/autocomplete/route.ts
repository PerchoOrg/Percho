import { autocomplete } from '@/lib/google/places';
/**
 * GET /api/places/autocomplete?q=...&session=<uuid>
 *
 * Auth: requires a logged-in user (dashboard-only feature). Anonymous callers
 * get 401 to keep the API key behind a fence.
 */
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const session = (url.searchParams.get('session') ?? '').trim();

  if (q.length < 3) {
    return NextResponse.json({ predictions: [] });
  }
  if (!session) {
    return NextResponse.json({ error: 'session_required' }, { status: 400 });
  }

  try {
    const predictions = await autocomplete(q, session);
    return NextResponse.json({ predictions });
  } catch (err) {
    console.error('[places/autocomplete] failed', err);
    return NextResponse.json({ error: 'autocomplete_failed' }, { status: 502 });
  }
}
