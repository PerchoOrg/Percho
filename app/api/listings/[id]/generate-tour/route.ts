/**
 * POST /api/listings/[id]/generate-tour
 *
 * Phase 12 stub (2026-06-12). Interface-only contract for the future
 * "Generate AI tour video from listing photos" feature. Always returns 501
 * with a structured "not implemented" payload so:
 *
 *   - The frontend button can wire up against the real endpoint URL today
 *     (no second wiring pass when implementation lands).
 *   - Anyone hitting the endpoint accidentally (curl, Postman) gets a clear
 *     error with a coming-soon ETA — no silent 200, no 404.
 *
 * Auth: same shape as future implementation — requires an authenticated agent
 * who owns the listing. We do the auth + ownership check now so the failure
 * mode is "not implemented" not "leaks listing existence to anon callers".
 *
 * Future implementation (Q4 2026 target — actual API not chosen yet):
 *   1. Validate listing has ≥3 photos (Phase 10 prerequisite).
 *   2. Enqueue a job: photo URLs → external API (Runway / Luma / Pika / etc.).
 *   3. On callback, write the rendered MP4 into Cloudflare Stream and
 *      attach as a `listing_videos` row with `kind='ai_tour'`.
 *   4. Realtime-notify the dashboard (existing channel).
 *
 * See `docs/api/tour-generation.md` for the full contract.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Coming-soon ETA. Update when the API is selected.
const ETA = 'Q4 2026';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Ownership check — same as real impl will use. Returns 404 (not 403) so
  // we don't leak listing existence to non-owners.
  const { data: listing } = (await supabase
    .from('listings')
    .select('id')
    .eq('id', id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      error: 'not_implemented',
      message: `AI-generated home tour videos are coming soon. We are evaluating providers; ETA ${ETA}.`,
      eta: ETA,
      listing_id: id,
    },
    { status: 501 },
  );
}
