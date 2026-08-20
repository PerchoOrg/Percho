/**
 * /admin/pipeline/bgm — background music library browser + curator.
 *
 * viewer with <audio controls>.
 * add + delete. Storage-canonical.
 * `cinematic` bucket retired. Per-track hard-delete
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
import { readBgmState } from '@/lib/bgm/state-store';
import { BGM_BUCKET, BGM_VIBES, type BgmVibe, bgmPublicUrl } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { type BgmTrack, BgmVibeSection } from './BgmVibeSection';

export const dynamic = 'force-dynamic';

async function listVibe(
  vibe: BgmVibe,
  rejected: Set<string>,
  pending: Set<string>,
  meta: NonNullable<Awaited<ReturnType<typeof readBgmState>>['meta']>,
): Promise<BgmTrack[]> {
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
      pending: pending.has(`${vibe}/${o.name}`),
      title: meta[`${vibe}/${o.name}`]?.title,
      tags: meta[`${vibe}/${o.name}`]?.tags,
      role: meta[`${vibe}/${o.name}`]?.role,
    }));
}

export default async function BgmLibraryPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');

  const state = await readBgmState();
  const rejected = new Set(state.rejected);
  const pending = new Set(state.pending ?? []);
  const byVibe = await Promise.all(
    BGM_VIBES.map((v) =>
      listVibe(v, rejected, pending, state.meta ?? {}).then((t) => [v, t] as const),
    ),
  );
  // A vibe with tracks waiting on a decision sorts to the top of the page —
  // review is the step that blocks generated music from being usable.
  const ordered = [...byVibe].sort(
    (a, b) => b[1].filter((t) => t.pending).length - a[1].filter((t) => t.pending).length,
  );

  return (
    <div className="space-y-6">
      {ordered.map(([vibe, tracks]) => (
        <BgmVibeSection key={vibe} vibe={vibe} tracks={tracks} />
      ))}

      <footer className="rounded-2xl border border-line bg-surface px-4 py-3 text-ink2 text-xs sm:px-5">
        <div className="font-medium text-ink">Attribution</div>
        <div>
          Existing Kevin MacLeod tracks: Music by Kevin MacLeod (incompetech.com), Licensed under CC
          BY 4.0.
        </div>
        <div className="mt-1">
          When adding tracks, ensure the source license permits commercial use. See{' '}
          <code className="rounded bg-surface px-1 py-0.5">docs/bgm/vibe-map.md</code> for the
          curation SOP (instrumental, 80–100 BPM, no vocals, no EDM drops).
        </div>
      </footer>
    </div>
  );
}
