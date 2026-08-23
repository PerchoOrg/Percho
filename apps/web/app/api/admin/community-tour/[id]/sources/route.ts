/**
 * GET   /api/admin/community-tour/[id]/sources — the pages the ingest step may read.
 * PATCH /api/admin/community-tour/[id]/sources — tick or untick one of them.
 *
 * The rows themselves are written by the ingest step (from what research
 * found, and from the community site's own subpages) and by the paste box in
 * `PhotoSourcePanel`. This route only lists them and flips `enabled`, which is
 * the owner's half of the rule: the community's own site is on by default,
 * "other webpages are optional unless I manually selected them for fetching"
 * (2026-08-23).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { CommunityPhotoSourceToggle } from '@/lib/zod/schemas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('community_photo_sources')
    .select('id, url, label, origin, enabled, expanded_at, last_ingested_at, last_result')
    .eq('community_id', communityId)
    .order('origin', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'read_failed', message: error.message }, { status: 500 });
  }
  return NextResponse.json({ sources: data ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  const parsed = CommunityPhotoSourceToggle.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const sb = createServiceClient();
  // Scoped to the community in the path as well as the row id: without it, a
  // uuid from one community would flip a source belonging to another.
  const { data, error } = await sb
    .from('community_photo_sources')
    .update({ enabled: parsed.data.enabled })
    .eq('id', parsed.data.id)
    .eq('community_id', communityId)
    .select('id, enabled')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'write_failed', message: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, source: data });
}
