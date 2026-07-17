/**
 * /admin/pipeline/bgm — background music library browser + curator.
 *
 * Phase 104 (2026-07-17): viewer with <audio controls>.
 * Phase 105 (2026-07-17): add + delete. Storage-canonical.
 * Phase 106 (2026-07-17): `cinematic` bucket retired. Per-track hard-delete
 * replaced with soft **reject** — rejected tracks stay in Storage (grouped
 * at the bottom of each vibe, dimmed) but the render worker skips
 * downloading them via `pull-bgm.sh`. One-click Approve restores.
 *
 * requireAdmin() runs in the parent layout; this page uses the service-role
 * client because the `bgm` bucket has no authed select policy (public reads
 * only from the CDN URL; the Storage list API requires service role or a
 * dedicated policy).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { BGM_BUCKET, BGM_VIBES, type BgmVibe, bgmPublicUrl } from '@/lib/bgm/storage';
import { readBgmState } from '@/lib/bgm/state-store';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BgmVibeSection, type BgmTrack } from './BgmVibeSection';

export const dynamic = 'force-dynamic';

async function listVibe(vibe: BgmVibe, rejected: Set<string>): Promise<BgmTrack[]> {
  const svc = createServiceClient();
  const { data } = await svc.storage.from(BGM_BUCKET).list(vibe, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  return (data ?? [])
    .filter((o) => /\.mp3$/i.test(o.name))
    .map((o) => ({
      name: o.name,
      url: bgmPublicUrl(vibe, o.name),
      rejected: rejected.has(`${vibe}/${o.name}`),
    }));
}

export default async function BgmLibraryPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  const state = await readBgmState();
  const rejected = new Set(state.rejected);
  const byVibe = await Promise.all(
    BGM_VIBES.map((v) => listVibe(v, rejected).then((t) => [v, t] as const)),
  );
  const active = byVibe.reduce((n, [, t]) => n + t.filter((x) => !x.rejected).length, 0);
  const rejectedCount = byVibe.reduce((n, [, t]) => n + t.filter((x) => x.rejected).length, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-xl text-ink">Background music</h1>
        <p className="text-ink2 text-sm">
          <span className="font-medium text-ink">{active}</span> approved tracks across{' '}
          {BGM_VIBES.length} vibe buckets
          {rejectedCount > 0 ? (
            <span className="text-ink2">
              {' '}
              · <span className="font-medium">{rejectedCount}</span> rejected (hidden from worker)
            </span>
          ) : null}
          . The render worker picks one approved track at random per video.
        </p>
        <p className="text-ink2 text-xs">
          Every row has <b>Approve</b> and <b>Reject</b> — the current call
          stays highlighted. Reject keeps the mp3 in Storage but the render
          worker stops picking it. Each section has two intake buttons:{' '}
          <b>Import</b> pulls from a curated Kevin MacLeod pool (server
          fetches from incompetech, no browser CORS);{' '}
          <b>Upload</b> takes local mp3s. After edits, run{' '}
          <code className="rounded bg-cream px-1 py-0.5">pull-bgm.sh</code> on
          the render host so the worker's local cache catches up.
        </p>
      </header>

      {byVibe.map(([vibe, tracks]) => (
        <BgmVibeSection key={vibe} vibe={vibe} tracks={tracks} />
      ))}

      <footer className="rounded-2xl border border-line bg-surface px-4 py-3 text-ink2 text-xs sm:px-5">
        <div className="font-medium text-ink">Attribution</div>
        <div>
          Existing Kevin MacLeod tracks: Music by Kevin MacLeod (incompetech.com), Licensed under
          CC BY 4.0.
        </div>
        <div className="mt-1">
          When adding tracks, ensure the source license permits commercial use. See{' '}
          <code className="rounded bg-cream px-1 py-0.5">docs/bgm/vibe-map.md</code> for the
          curation SOP (instrumental, 80–100 BPM, no vocals, no EDM drops).
        </div>
      </footer>
    </div>
  );
}
