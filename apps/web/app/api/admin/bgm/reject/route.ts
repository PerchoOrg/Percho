/**
 * POST /api/admin/bgm/reject — soft-reject or re-approve a track.
 *
 * Body: { path: string, rejected: boolean }
 *   path: "<vibe>/<file>.mp3" — must live in a known vibe folder
 *   rejected: true → add to rejected list; false → remove from rejected list
 *
 * The mp3 is NOT deleted from Storage. The render worker consults
 * `bgm/_state/state.json` via `pull-bgm.sh` and skips rejected tracks when
 * refreshing its local cache. Unrejecting is a one-click restore.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { readBgmState, writeBgmState } from '@/lib/bgm/state-store';
import { isBgmVibe } from '@/lib/bgm/storage';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { path?: string; rejected?: boolean } | null;
  const path = body?.path?.trim() ?? '';
  const rejected = body?.rejected;
  if (!path || typeof rejected !== 'boolean') {
    return NextResponse.json({ error: 'missing path or rejected flag' }, { status: 400 });
  }

  const [vibe, ...rest] = path.split('/');
  if (!vibe || !isBgmVibe(vibe) || rest.length !== 1 || !rest[0]?.endsWith('.mp3')) {
    return NextResponse.json({ error: `invalid path: ${path}` }, { status: 400 });
  }

  const state = await readBgmState();
  const set = new Set(state.rejected);
  if (rejected) set.add(path);
  else set.delete(path);
  await writeBgmState({ ...state, rejected: Array.from(set).sort() });

  return NextResponse.json({ path, rejected });
}
