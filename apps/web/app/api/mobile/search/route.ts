/**
 * Mobile entity search (phase D).
 *
 *   GET /api/mobile/search?q=<text>
 *   → 200 SearchResultDTO | 400 { error } | 500 { error }
 *
 * Projection and the two queries live in `lib/listings/search.ts`.
 */

import { searchEntities } from '@/lib/listings/search';
import { mobileSearchQuerySchema } from '@/lib/zod/mobile-search';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('q') ?? '';
  const parsed = mobileSearchQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 });
  }

  try {
    return NextResponse.json(await searchEntities(parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
