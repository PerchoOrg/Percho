/**
 * POST /api/admin/bgm/generate — generate background music into a vibe.
 *
 * Body: { vibe: BgmVibe, count?: 1-4, seconds?: 30-180, extra?: string }
 *
 * Each track lands in Storage AND in `state.pending`, so it is visible in the
 * admin for review and invisible to the render worker until approved. Owner
 * 2026-08-20: "ai generation, review and approve/reject process."
 *
 * Partial success is the normal case, not an error: Lyria's safety filter
 * rejects prompts for an unspecified policy reason and is not reproducible
 * about it (observed on the second live call, with a prompt whose only
 * difference from a passing one was a removed timestamp block). A request for
 * four tracks that returns three has done its job; the response reports each
 * outcome so the UI can say which.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  LYRIA_COST_USD,
  buildLyriaPrompt,
  generateLyriaTrack,
  lyriaFilename,
} from '@/lib/bgm/lyria';
import { readBgmState, writeBgmState } from '@/lib/bgm/state-store';
import { BGM_BUCKET, isBgmVibe } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// One track took 29s on the first live call; four sequential ones need room.
export const maxDuration = 300;

const MAX_COUNT = 4;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    vibe?: string;
    count?: number;
    seconds?: number;
    extra?: string;
  } | null;

  const vibe = body?.vibe ?? '';
  if (!isBgmVibe(vibe))
    return NextResponse.json({ error: `unknown vibe: ${vibe}` }, { status: 400 });
  const count = Math.min(MAX_COUNT, Math.max(1, Math.round(body?.count ?? 1)));
  const seconds = Math.min(180, Math.max(30, Math.round(body?.seconds ?? 90)));
  const extra = typeof body?.extra === 'string' ? body.extra.slice(0, 600) : undefined;

  const svc = createServiceClient();
  const prompt = buildLyriaPrompt(vibe, seconds, extra);
  const results: Array<{ file: string; status: 'ok' | 'error'; error?: string }> = [];
  const created: string[] = [];

  // Sequential, not parallel: four concurrent 30s generations is the kind of
  // burst that trips a rate limit, and the whole batch would fail together.
  for (let i = 0; i < count; i++) {
    const file = lyriaFilename(vibe);
    try {
      const track = await generateLyriaTrack(prompt);
      const { error } = await svc.storage.from(BGM_BUCKET).upload(`${vibe}/${file}`, track.bytes, {
        contentType: 'audio/mpeg',
        upsert: false,
      });
      if (error) throw new Error(error.message);
      created.push(`${vibe}/${file}`);
      results.push({ file, status: 'ok' });
    } catch (err) {
      results.push({
        file,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Written once, after the loop: the sidecar is a whole-object overwrite, so
  // a write per track would be a lost-update race against itself.
  if (created.length > 0) {
    const state = await readBgmState();
    await writeBgmState({
      ...state,
      pending: Array.from(new Set([...(state.pending ?? []), ...created])).sort(),
    });
  }

  return NextResponse.json({
    vibe,
    generated: created.length,
    requested: count,
    cost_usd: Number((created.length * LYRIA_COST_USD).toFixed(2)),
    prompt,
    results,
  });
}
