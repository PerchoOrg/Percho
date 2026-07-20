/**
 * POST /api/admin/bgm/upload-sign — reserve a path + return a signed upload URL.
 *
 * The old /api/admin/bgm/upload route accepted the mp3 bytes as multipart, which
 * hit Vercel's ~4.5MB serverless request-body cap and surfaced as an opaque
 * "Unexpected token 'R', 'Request En'..." JSON parse error on the client.
 *
 * New flow: client POSTs JSON `{ vibe, filenames[] }` here → we compute the
 * NN-slug.mp3 path for each file and return `{ path, token }` per file via
 * Supabase Storage `createSignedUploadUrl`. Client then calls
 * `uploadToSignedUrl(path, token, file)` from the browser, bypassing Vercel
 * entirely. Object size cap now enforced by Supabase Storage bucket config,
 * not by us.
 *
 * Auth: same requireAdmin() gate as the old route.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { BGM_BUCKET, BGM_VIBES, isBgmVibe, slugifyBgmFilename } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SignResult =
  | { file: string; status: 'ok'; path: string; token: string }
  | { file: string; status: 'error'; error: string };

/** Return the highest NN- prefix currently in the bucket (across ALL vibes). */
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

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { vibe?: string; filenames?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const vibe = String(body.vibe ?? '');
  if (!isBgmVibe(vibe)) {
    return NextResponse.json({ error: `invalid vibe: ${vibe}` }, { status: 400 });
  }

  const filenames = Array.isArray(body.filenames)
    ? body.filenames.filter((n) => typeof n === 'string')
    : [];
  if (filenames.length === 0) {
    return NextResponse.json({ error: 'no filenames' }, { status: 400 });
  }

  const svc = createServiceClient();
  const results: SignResult[] = [];
  let counter = await nextTrackNumber();

  for (const name of filenames) {
    const slug = slugifyBgmFilename(name);
    const nn = String(counter).padStart(2, '0');
    const path = `${vibe}/${nn}-${slug}.mp3`;
    counter += 1;

    const { data, error } = await svc.storage.from(BGM_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      results.push({ file: name, status: 'error', error: error?.message ?? 'sign failed' });
      continue;
    }
    results.push({ file: name, status: 'ok', path: data.path, token: data.token });
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  return NextResponse.json({ signed: ok, results }, { status: ok > 0 ? 200 : 400 });
}
