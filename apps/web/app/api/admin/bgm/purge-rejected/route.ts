/**
 * POST /api/admin/bgm/purge-rejected — hard-delete all soft-rejected tracks.
 *
 * Reads the rejected list from `bgm/_state/state.json`, removes those objects
 * from Storage, then clears the rejected list. One-way — unreject is gone
 * once you purge.
 *
 * Body (optional): { vibe?: string }
 *   - omitted: purge every rejected track across every vibe
 *   - provided: purge only the rejected tracks that live in that vibe folder
 *
 * Returns: { purged: number, paths: string[] }
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { readBgmState, writeBgmState } from '@/lib/bgm/state-store';
import { BGM_BUCKET, isBgmVibe } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { vibe?: string };
  const vibeFilter = body?.vibe?.trim();
  if (vibeFilter && !isBgmVibe(vibeFilter)) {
    return NextResponse.json({ error: `invalid vibe: ${vibeFilter}` }, { status: 400 });
  }

  const state = await readBgmState();
  const targets = vibeFilter
    ? state.rejected.filter((p) => p.startsWith(`${vibeFilter}/`))
    : state.rejected;

  if (targets.length === 0) {
    return NextResponse.json({ purged: 0, paths: [] });
  }

  const svc = createServiceClient();
  const { error } = await svc.storage.from(BGM_BUCKET).remove(targets);
  if (error) {
    return NextResponse.json({ error: `storage remove failed: ${error.message}` }, { status: 500 });
  }

  const remaining = state.rejected.filter((p) => !targets.includes(p));
  await writeBgmState({ ...state, rejected: remaining });

  return NextResponse.json({ purged: targets.length, paths: targets });
}
