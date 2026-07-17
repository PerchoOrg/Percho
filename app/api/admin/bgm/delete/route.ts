/**
 * POST /api/admin/bgm/delete — remove a single track from the bgm bucket.
 *
 * Body: { path: string }   e.g. "warm-acoustic/07-amazing-plan.mp3"
 *
 * Auth: requireAdmin() gate. Path must be inside a known vibe folder
 * (defensive — prevents an admin from accidentally deleting outside
 * the bucket's expected layout).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { BGM_BUCKET, isBgmVibe } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  const path = body?.path?.trim() ?? '';
  if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 });

  const [vibe, ...rest] = path.split('/');
  if (!vibe || !isBgmVibe(vibe) || rest.length !== 1 || !rest[0]?.endsWith('.mp3')) {
    return NextResponse.json({ error: `invalid path: ${path}` }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.storage.from(BGM_BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: path });
}
