/**
 * Record every background track's length in the BGM sidecar (phase366.25).
 *
 * The plan leaves out a track shorter than the film it scores: the mux loops a
 * short track (`-stream_loop -1`), and two 118-second city films played their
 * 80- and 98-second tracks a second time from the top. It can only do that for
 * tracks whose length it knows — `BgmState.seconds`, which this fills.
 *
 * Downloads each track in the bucket, reads its length with ffprobe, and
 * writes the map back into `bgm/_state/state.json`, keeping everything else in
 * the sidecar as it was. Re-running is safe; it re-measures every track.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage, from apps/web (source .env.local first):
 *   pnpm exec tsx ../../scripts/admin/measure-bgm.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BGM_BUCKET, BGM_STATE_PATH, BGM_VIBES } from '../../apps/web/lib/bgm/storage';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

async function main() {
  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const { data: stateBlob, error: stateErr } = await sb.storage
    .from(BGM_BUCKET)
    .download(BGM_STATE_PATH);
  if (stateErr || !stateBlob) throw new Error(`cannot read the sidecar: ${stateErr?.message}`);
  const state = JSON.parse(await stateBlob.text()) as Record<string, unknown>;

  const dir = mkdtempSync(join(tmpdir(), 'bgm-'));
  const seconds: Record<string, number> = {};
  try {
    for (const vibe of BGM_VIBES) {
      const { data } = await sb.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
      for (const obj of data ?? []) {
        if (!/\.mp3$/i.test(obj.name)) continue;
        const path = `${vibe}/${obj.name}`;
        const { data: blob, error } = await sb.storage.from(BGM_BUCKET).download(path);
        if (error || !blob) {
          console.warn(`skip ${path}: ${error?.message}`);
          continue;
        }
        const file = join(dir, 'track.mp3');
        writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
        const out = execFileSync(
          'ffprobe',
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
          { encoding: 'utf8' },
        );
        const s = Math.round(Number(out.trim()) * 10) / 10;
        if (s > 0) seconds[path] = s;
        console.log(`${s.toFixed(1).padStart(6)}  ${path}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const body = JSON.stringify({ ...state, seconds, updated_at: new Date().toISOString() }, null, 2);
  const { error } = await sb.storage
    .from(BGM_BUCKET)
    .upload(BGM_STATE_PATH, new Blob([body], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw new Error(`sidecar write failed: ${error.message}`);
  console.log(`recorded ${Object.keys(seconds).length} track lengths`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
