/**
 * GET   /api/admin/community-tour/[id]/voice — the catalogue, and this community's pick.
 * PATCH /api/admin/community-tour/[id]/voice — set or clear that pick.
 *
 * A pool of voices has existed since 2026-08-20 and every community was read
 * by the same one, because the picker's first rule matched every community
 * (see `voiceForCommunity`). Two things were missing: a picker that varies,
 * and a way to overrule it. This is the second.
 *
 * The PATCH writes in TWO places on purpose:
 *
 *   communities.narration_voice   durable. Every future plan reads it.
 *   step_results.photos.narration.voice   the run on screen.
 *
 * The second is what makes the choice audible without re-planning. The worker
 * synthesises narration at ASSEMBLE time from `narration.voice`
 * (scripts/render-worker/worker.py), so patching it means: pick a voice, press
 * Assemble, hear it. Re-running plan instead would pay for Curator and a fresh
 * script to change one string.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { AUTO_VOICE_POOL, VOICE_CATALOGUE, VOICE_IDS } from '@/lib/poi/tour-orchestrator/narration';
import type { Json } from '@/lib/supabase/database.types';
import { createServiceClient } from '@/lib/supabase/server';
import { CommunityNarrationVoice } from '@/lib/zod/schemas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  const sb = createServiceClient();
  const { data } = await sb
    .from('communities')
    .select('narration_voice')
    .eq('id', communityId)
    .maybeSingle();

  return NextResponse.json({
    voices: VOICE_CATALOGUE.map((v) => ({ ...v, auto: AUTO_VOICE_POOL.includes(v.id) })),
    selected: data?.narration_voice ?? null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  const parsed = CommunityNarrationVoice.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  // '' clears the override and hands the choice back to `voiceForCommunity`.
  const voice = parsed.data.voice.trim();
  if (voice !== '' && !VOICE_IDS.has(voice)) {
    return NextResponse.json(
      { error: 'unknown_voice', message: `${voice} is not a Gemini TTS voice.` },
      { status: 400 },
    );
  }

  const sb = createServiceClient();
  const { error } = await sb
    .from('communities')
    .update({ narration_voice: voice === '' ? null : voice })
    .eq('id', communityId);
  if (error) {
    return NextResponse.json({ error: 'write_failed', message: error.message }, { status: 500 });
  }

  // Patch the run on screen so Assemble picks it up. Clearing the override
  // leaves the run alone: the automatic voice is recomputed by the next plan,
  // and silently swapping the narrator of an already-reviewed script is worse
  // than leaving it until something asks for a new one.
  let appliedToRun = false;
  if (voice !== '') {
    const { data: run } = await sb
      .from('community_tour_runs')
      .select('id, step_results')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const results = (run?.step_results ?? {}) as Record<string, Json>;
    const photos = results.photos;
    if (run && photos && typeof photos === 'object' && !Array.isArray(photos)) {
      const narration = (photos as Record<string, Json>).narration;
      if (narration && typeof narration === 'object' && !Array.isArray(narration)) {
        await sb
          .from('community_tour_runs')
          .update({
            step_results: {
              ...results,
              photos: { ...(photos as Record<string, Json>), narration: { ...narration, voice } },
            } as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', run.id);
        appliedToRun = true;
      }
    }
  }

  return NextResponse.json({ ok: true, voice: voice === '' ? null : voice, appliedToRun });
}
