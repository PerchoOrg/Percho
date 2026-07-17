/**
 * /admin/pipeline/bgm — background music library browser + editor.
 *
 * Phase 104 (2026-07-17): viewer with <audio controls>.
 * Phase 105 (2026-07-17): add + delete. Storage is now canonical for the
 * admin UI (list objects live per vibe). Manifest.json is retained but only
 * used by the render worker's local cache — `scripts/render-worker/pull-bgm.sh`
 * syncs Storage → worker disk.
 *
 * requireAdmin() runs in the parent layout; this page uses the service-role
 * client because the `bgm` bucket has no authed select policy (public reads
 * only from the CDN URL; the Storage list API requires service role or a
 * dedicated policy).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { BGM_BUCKET, BGM_VIBES, type BgmVibe, bgmPublicUrl } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BgmVibeSection, type BgmTrack } from './BgmVibeSection';

export const dynamic = 'force-dynamic';

async function listVibe(vibe: BgmVibe): Promise<BgmTrack[]> {
  const svc = createServiceClient();
  const { data } = await svc.storage.from(BGM_BUCKET).list(vibe, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  return (data ?? [])
    .filter((o) => /\.mp3$/i.test(o.name))
    .map((o) => ({ name: o.name, url: bgmPublicUrl(vibe, o.name) }));
}

export default async function BgmLibraryPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  const byVibe = await Promise.all(BGM_VIBES.map((v) => listVibe(v).then((t) => [v, t] as const)));
  const total = byVibe.reduce((n, [, t]) => n + t.length, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-xl text-ink">Background music</h1>
        <p className="text-ink2 text-sm">
          {total} tracks across {BGM_VIBES.length} vibe buckets. The render worker picks one at
          random per video. Upload an mp3 to add a track, or delete one to remove it from
          rotation.
        </p>
        <p className="text-ink2 text-xs">
          After add/delete, run <code className="rounded bg-cream px-1 py-0.5">pull-bgm.sh</code>{' '}
          on the render host so the worker's local cache matches Storage before the next render.
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
