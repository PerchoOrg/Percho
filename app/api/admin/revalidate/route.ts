/**
 * POST /api/admin/revalidate?tag=community-cards
 *
 * Manual cache-tag invalidation for backfill scripts (nextdoor seeder etc).
 * Guarded by `x-admin-token` header = SUPABASE_SERVICE_ROLE_KEY (server-only
 * secret; not exposed to the client). The check is intentionally cheap —
 * this route only busts caches, no data writes.
 */

import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const token = req.headers.get('x-admin-token');
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');
  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });
  revalidateTag(tag);
  return NextResponse.json({ ok: true, tag });
}
