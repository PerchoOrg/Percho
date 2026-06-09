import { placeDetails } from '@/lib/google/places';
/**
 * GET /api/places/details?place_id=...&session=***
 *
 * Returns parsed address components + lat/lng for a chosen autocomplete
 * prediction. Auth-gated (dashboard-only).
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
  const placeId = (url.searchParams.get('place_id') ?? '').trim();
  const session = (url.searchParams.get('session') ?? '').trim();
  if (!placeId) {
    return NextResponse.json({ error: 'place_id_required' }, { status: 400 });
  }
  if (!session) {
    return NextResponse.json({ error: 'session_required' }, { status: 400 });
  }

  try {
    const details = await placeDetails(placeId, session);
    if (!details) {
      return NextResponse.json({ error: 'place_not_found' }, { status: 404 });
    }
    return NextResponse.json({ details });
  } catch (err) {
    console.error('[places/details] failed', err);
    return NextResponse.json({ error: 'details_failed' }, { status: 502 });
  }
}
