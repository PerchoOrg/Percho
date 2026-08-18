/**
 * Mobile community detail endpoint — the destination of the card's
 * "Why people love it →" CTA (owner, 2026-08-02).
 *
 *   GET /api/mobile/community/<id-or-slug>
 *   → 200 CommunityDetailDTO | 404 { error } | 500 { error }
 *
 * Accepts an id or a slug: the feed carries ids, shared links carry slugs — same
 * contract as `/api/mobile/listing/<id>`.
 *
 * Every projection rule — which figures ship, why `avg_income` never will, why
 * this is not spec-v3 §3.3's four-pillar explore page — lives in
 * `lib/communities/detail.ts`. Read that file's header before changing this one.
 */

import { fetchCommunityDetail } from '@/lib/communities/detail';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'community id or slug required' }, { status: 400 });
  }

  try {
    const detail = await fetchCommunityDetail(id.trim());
    if (!detail) {
      return NextResponse.json({ error: 'community not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
