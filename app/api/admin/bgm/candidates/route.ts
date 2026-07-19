/**
 * GET /api/admin/bgm/candidates?vibe=<BgmVibe>&q=<search>
 *
 * Live-search Kevin MacLeod's incompetech catalog. Returns tracks NOT yet
 * present in the bucket (matched by slug) so the picker only shows new
 * options. Empty q returns a default suggestion set derived from the
 * vibe's `feel` keywords.
 *
 * Each result includes `previewUrl` so the browser can play it inline
 * before deciding to import. (Media elements don't need CORS for
 * playback.)
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  type IncompetechPiece,
  fetchIncompetechCatalog,
  incompetechMp3Url,
  pieceSlug,
  searchCatalog,
} from '@/lib/bgm/incompetech';
import { BGM_BUCKET, type BgmVibe, isBgmVibe } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Default seed query per vibe when the picker opens with no user input. */
const DEFAULT_QUERIES: Record<BgmVibe, string> = {
  'warm-acoustic': 'acoustic',
  'modern-corporate': 'corporate',
  'luxury-ambient': 'calming',
  'chill-electronic': 'electronic',
};

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const vibe = searchParams.get('vibe') ?? '';
  const q = searchParams.get('q') ?? '';
  if (!isBgmVibe(vibe))
    return NextResponse.json({ error: `invalid vibe: ${vibe}` }, { status: 400 });

  let catalog: IncompetechPiece[];
  try {
    catalog = await fetchIncompetechCatalog();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'catalog fetch failed' },
      { status: 502 },
    );
  }

  const svc = createServiceClient();
  const { data } = await svc.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
  const owned = new Set<string>(
    (data ?? []).map((o) => o.name.replace(/^\d+-/, '').replace(/\.mp3$/i, '')),
  );

  const query = q.trim() || DEFAULT_QUERIES[vibe];
  const hits = searchCatalog(catalog, query, 60).filter((p) => !owned.has(pieceSlug(p.title)));

  const results = hits.map((p) => ({
    title: p.title,
    filename: p.filename,
    feel: p.feel ?? null,
    bpm: p.bpm ?? null,
    instruments: p.instruments ?? null,
    length: p.length ?? null,
    slug: pieceSlug(p.title),
    previewUrl: incompetechMp3Url(p.filename),
  }));

  return NextResponse.json({ vibe, query, total: catalog.length, count: results.length, results });
}
