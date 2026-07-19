/**
 * POST /api/admin/bgm/import — fetch selected tracks from the incompetech
 * catalog and upload them into the `bgm` bucket.
 *
 * Body: { vibe: BgmVibe, filenames: string[] }
 *   `filenames` are exact `pieces.json.filename` values (e.g.
 *   "Cheery Monday.mp3"). We look up the title via the catalog so the
 *   stored slug matches the browser's picker.
 *
 * Sequential fetch (incompetech is polite about that) — the operation is
 * user-initiated and rare, so parallelism isn't worth the complexity.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { fetchIncompetechCatalog, incompetechMp3Url, pieceSlug } from '@/lib/bgm/incompetech';
import { BGM_BUCKET, BGM_VIBES, isBgmVibe } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ImportResult = {
  filename: string;
  status: 'ok' | 'skipped' | 'error';
  title?: string;
  path?: string;
  error?: string;
};

async function nextTrackNumber(): Promise<number> {
  const svc = createServiceClient();
  let max = 0;
  for (const vibe of BGM_VIBES) {
    const { data } = await svc.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
    for (const obj of data ?? []) {
      const m = /^(\d+)-/.exec(obj.name);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
  }
  return max + 1;
}

async function existingSlugs(vibe: string): Promise<Set<string>> {
  const svc = createServiceClient();
  const { data } = await svc.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
  return new Set<string>(
    (data ?? []).map((o) => o.name.replace(/^\d+-/, '').replace(/\.mp3$/i, '')),
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { vibe?: string; filenames?: string[] } | null;
  const vibe = body?.vibe ?? '';
  const filenames = Array.isArray(body?.filenames) ? body.filenames : [];

  if (!isBgmVibe(vibe)) return NextResponse.json({ error: `invalid vibe: ${vibe}` }, { status: 400 });
  if (filenames.length === 0) return NextResponse.json({ error: 'no filenames' }, { status: 400 });
  if (filenames.length > 30) return NextResponse.json({ error: 'too many (max 30)' }, { status: 400 });

  const catalog = await fetchIncompetechCatalog();
  const byFilename = new Map(catalog.map((p) => [p.filename, p]));

  const svc = createServiceClient();
  const owned = await existingSlugs(vibe);
  let counter = await nextTrackNumber();

  const results: ImportResult[] = [];
  for (const raw of filenames) {
    const filename = String(raw).trim();
    const piece = byFilename.get(filename);
    if (!piece) {
      results.push({ filename, status: 'error', error: 'not in incompetech catalog' });
      continue;
    }
    const slug = pieceSlug(piece.title);
    if (!slug) {
      results.push({ filename, title: piece.title, status: 'error', error: 'unslugifiable title' });
      continue;
    }
    if (owned.has(slug)) {
      results.push({ filename, title: piece.title, status: 'skipped', error: 'already in bucket' });
      continue;
    }

    let bytes: Uint8Array;
    try {
      const url = incompetechMp3Url(filename);
      const res = await fetch(url, { headers: { 'User-Agent': 'Percho-admin/1.0' } });
      if (!res.ok) {
        results.push({
          filename,
          title: piece.title,
          status: 'error',
          error: `fetch ${res.status} from incompetech`,
        });
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100_000) {
        results.push({
          filename,
          title: piece.title,
          status: 'error',
          error: `too small (${buf.byteLength}b)`,
        });
        continue;
      }
      if (buf.byteLength > 30 * 1024 * 1024) {
        results.push({
          filename,
          title: piece.title,
          status: 'error',
          error: `too big (${buf.byteLength}b)`,
        });
        continue;
      }
      bytes = new Uint8Array(buf);
    } catch (e) {
      results.push({
        filename,
        title: piece.title,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const nn = String(counter).padStart(2, '0');
    const path = `${vibe}/${nn}-${slug}.mp3`;
    counter += 1;

    const { error } = await svc.storage
      .from(BGM_BUCKET)
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: false });
    if (error) {
      results.push({ filename, title: piece.title, status: 'error', error: error.message });
      continue;
    }
    owned.add(slug);
    results.push({ filename, title: piece.title, status: 'ok', path });
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  return NextResponse.json({ imported: ok, results }, { status: ok > 0 ? 200 : 400 });
}
