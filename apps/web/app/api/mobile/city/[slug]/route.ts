/**
 * Mobile city detail endpoint — the destination of the city card's Explore
 * link (phase327).
 *
 *   GET /api/mobile/city/<slug>
 *   → 200 CityDetailDTO | 400 { error } | 404 { error } | 500 { error }
 *
 * What a city page carries, and why it has no safety figure, lives in
 * `packages/shared/src/city.ts` and `lib/cities/detail.ts`.
 */

import { fetchCityDetail } from '@/lib/cities/detail';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** `cities.slug`: "suwanee-ga". */
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const parsed = slugSchema.safeParse((await ctx.params).slug);
  if (!parsed.success) {
    return NextResponse.json({ error: 'a city slug is required' }, { status: 400 });
  }

  try {
    const detail = await fetchCityDetail(parsed.data);
    if (!detail) return NextResponse.json({ error: 'city not found' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
