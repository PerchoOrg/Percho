/**
 * GET /api/mobile/similar?likedIds=<uuid>,<uuid>,… — collaborative filtering
 * over the swipe log.
 *
 *   → 200 { scores: { [listingId]: 0..1 } }
 *
 * The response depends only on `likedIds` and the (slow-moving) swipe log,
 * so it is CDN-cached like the feed pool — five minutes is fresher than the
 * log actually changes at today's volume.
 *
 * Service-role read, same posture as the events sink this table was built
 * around: `mobile_events` is RLS-locked to the service role, and what leaves
 * here is an anonymous aggregate (listing ids and scores) — no install ids,
 * no user ids, nothing about any single buyer.
 */

import { coLikeScores } from '@/lib/feed/co-like';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * How much of the swipe log one request reads, newest first. Enough for
 * years at today's volume; when it is not, the window simply becomes "the
 * most recent tastes", which is the right degradation for a taste signal.
 */
const MAX_LIKE_ROWS = 5000;
const PAGE = 1000;

const paramsSchema = z.object({
  likedIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    likedIds: (searchParams.get('likedIds') ?? '').split(',').filter((s) => s.length > 0),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid likedIds' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const rows: { install_id: string; card_id: string | null }[] = [];
  // PostgREST caps reads at 1000 rows — page explicitly (repo rule).
  for (let from = 0; from < MAX_LIKE_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from('mobile_events')
      .select('install_id, card_id')
      .eq('type', 'swipe')
      .eq('card_type', 'listing')
      .eq('verdict', 'R')
      .order('received_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: 'read failed' }, { status: 500 });
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const scores = coLikeScores(rows, parsed.data.likedIds);
  return NextResponse.json(
    { scores },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
