/**
 * POST /api/admin/bgm/upload — add one or more mp3s to a vibe bucket.
 *
 * Multipart body:
 *   - vibe: string  (must be one of BGM_VIBES)
 *   - files: File[]  (any number of audio/mpeg blobs)
 *
 * Auth: layout gate is behind /admin/*, but /api/* isn't — so re-check
 * requireAdmin() here. Uploads use the service-role client because the
 * `bgm` bucket has no authed write policy (admins only via this route).
 *
 * Filenames are slugified + a next-numeric prefix (following the existing
 * NN-slug.mp3 convention). If a slug collides with something already in
 * the bucket the caller sees a 409 for that file (partial success is ok —
 * other files still succeed).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { BGM_BUCKET, isBgmVibe, slugifyBgmFilename } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type UploadResult = { file: string; status: 'ok' | 'error'; path?: string; error?: string };

/** Return the highest NN- prefix currently in the bucket (across ALL vibes). */
async function nextTrackNumber(): Promise<number> {
  const svc = createServiceClient();
  let max = 0;
  // list each vibe folder (Storage list is per-prefix)
  for (const vibe of ['warm-acoustic', 'modern-corporate', 'luxury-ambient', 'chill-electronic', 'cinematic']) {
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

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form-data body' }, { status: 400 });
  }

  const vibe = String(form.get('vibe') ?? '');
  if (!isBgmVibe(vibe)) {
    return NextResponse.json({ error: `invalid vibe: ${vibe}` }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no files' }, { status: 400 });
  }

  const svc = createServiceClient();
  const results: UploadResult[] = [];
  let counter = await nextTrackNumber();

  for (const file of files) {
    const type = file.type || 'application/octet-stream';
    if (!type.startsWith('audio/')) {
      results.push({ file: file.name, status: 'error', error: `not audio: ${type}` });
      continue;
    }
    // 20 MB cap — the KML tracks are all <10MB. Anything bigger is a mis-upload.
    if (file.size > 20 * 1024 * 1024) {
      results.push({ file: file.name, status: 'error', error: 'file > 20MB' });
      continue;
    }

    const slug = slugifyBgmFilename(file.name);
    const nn = String(counter).padStart(2, '0');
    const path = `${vibe}/${nn}-${slug}.mp3`;
    counter += 1;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await svc.storage
      .from(BGM_BUCKET)
      .upload(path, bytes, { contentType: 'audio/mpeg', upsert: false });

    if (error) {
      results.push({ file: file.name, status: 'error', error: error.message });
      continue;
    }
    results.push({ file: file.name, status: 'ok', path });
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  return NextResponse.json({ uploaded: ok, results }, { status: ok > 0 ? 200 : 400 });
}
