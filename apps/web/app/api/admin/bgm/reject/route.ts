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

  const body = (await req.json().catch(() => null)) as {
    path?: string;
    paths?: string[];
    rejected?: boolean;
  } | null;
  // `paths` for a batch, `path` for the original one-track call. Reviewing a
  // generated set is a batch action by nature, and culling the imported
  // library to eight meant acting on twenty-two at once.
  const paths = (body?.paths ?? (body?.path ? [body.path] : []))
    .map((p) => p.trim())
    .filter(Boolean);
  const rejected = body?.rejected;
  if (paths.length === 0 || typeof rejected !== 'boolean') {
    return NextResponse.json({ error: 'missing path(s) or rejected flag' }, { status: 400 });
  }

  for (const p of paths) {
    const [vibe, ...rest] = p.split('/');
    if (!vibe || !isBgmVibe(vibe) || rest.length !== 1 || !rest[0]?.endsWith('.mp3')) {
      return NextResponse.json({ error: `invalid path: ${p}` }, { status: 400 });
    }
  }

  const state = await readBgmState();
  const reject = new Set(state.rejected);
  // Either verdict is a REVIEW, so both clear the pending flag — that is what
  // makes this one endpoint serve the generated-track gate as well. Approving
  // is `rejected: false`, which now means "reviewed and kept" rather than
  // merely "not on the reject list".
  const pending = new Set(state.pending ?? []);
  for (const p of paths) {
    if (rejected) reject.add(p);
    else reject.delete(p);
    pending.delete(p);
  }
  await writeBgmState({
    ...state,
    rejected: Array.from(reject).sort(),
    pending: Array.from(pending).sort(),
  });

  return NextResponse.json({ paths, rejected, count: paths.length });
}
