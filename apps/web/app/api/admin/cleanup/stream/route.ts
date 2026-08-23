/**
 * GET  /api/admin/cleanup/stream — what is on Cloudflare Stream and who wants it.
 * POST /api/admin/cleanup/stream — delete the uids the panel listed.
 *
 * Every re-run of a tour uploads a fresh cut and leaves the old one behind.
 * Nothing has ever deleted them (owner 2026-08-23: "they are consuming my
 * resources, can we have some way to clean up them?").
 *
 * The POST re-reads every reference before it deletes anything. The panel's
 * list can be minutes old, and in those minutes an assembly can finish and
 * claim a uid that was unreferenced when the page rendered — phase92 did the
 * same pre-check by hand before deleting eleven assets. A uid that has since
 * become live is skipped and reported, not deleted.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { loadStreamRefs } from '@/lib/cleanup/refs';
import { classifyStreamAssets } from '@/lib/cleanup/stream-orphans';
import { deleteVideo, listVideos } from '@/lib/cloudflare/stream';
import { createServiceClient } from '@/lib/supabase/server';
import { StreamCleanupBody } from '@/lib/zod/cleanup';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const sb = createServiceClient();
    const [assets, refs] = await Promise.all([listVideos(), loadStreamRefs(sb)]);
    const report = classifyStreamAssets({
      assets: assets.map((a) => ({
        uid: a.uid,
        created: a.created,
        duration: a.duration,
        state: a.status?.state ?? 'unknown',
      })),
      refs,
    });
    return NextResponse.json({
      buckets: report.buckets,
      deletable: report.deletable,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'stream cleanup read failed' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = StreamCleanupBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'bad request' },
      { status: 400 },
    );
  }

  const sb = createServiceClient();
  const refs = await loadStreamRefs(sb);

  const deleted: string[] = [];
  const skipped: Array<{ uid: string; why: string }> = [];
  for (const uid of parsed.data.uids) {
    if (refs.get(uid) === 'live') {
      skipped.push({ uid, why: 'became live since the list was built' });
      continue;
    }
    const res = await deleteVideo(uid);
    if (res.ok) deleted.push(uid);
    else skipped.push({ uid, why: res.error ?? 'delete failed' });
  }

  return NextResponse.json({ deleted: deleted.length, skipped, at: new Date().toISOString() });
}
