'use client';

/**
 * BgmVibeSection — one vibe's tracks with per-row delete + section upload.
 *
 * Phase 105 (2026-07-17): Admin can now add/delete tracks. Storage-first;
 * `router.refresh()` after every mutation re-fetches the server list.
 */

import { BGM_VIBE_META, type BgmVibe, prettyTrackTitle } from '@/lib/bgm/storage';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export type BgmTrack = { name: string; url: string };

export function BgmVibeSection({ vibe, tracks }: { vibe: BgmVibe; tracks: BgmTrack[] }) {
  const meta = BGM_VIBE_META[vibe];
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('vibe', vibe);
      for (const f of Array.from(files)) fd.append('files', f);
      const res = await fetch('/api/admin/bgm/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.uploaded === 0) {
        const first = json?.results?.find((r: { status: string }) => r.status === 'error');
        throw new Error(first?.error ?? json?.error ?? 'upload failed');
      }
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(path: string) {
    setError(null);
    setDeleting(path);
    try {
      const res = await fetch('/api/admin/bgm/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'delete failed');
      }
      setConfirmDel(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-line border-b bg-cream/60 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-base text-ink">{meta.label}</h2>
          <p className="text-ink2 text-xs">{meta.blurb}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-ink2 text-xs">
            <span className="font-medium text-ink">{tracks.length}</span> tracks
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1 font-medium text-ink text-xs transition hover:border-ink2 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/mpeg,audio/mp3,.mp3"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {error ? (
        <div className="border-line border-b bg-red-50 px-4 py-2 text-red-700 text-xs sm:px-5">
          {error}
        </div>
      ) : null}

      {tracks.length === 0 ? (
        <div className="px-4 py-6 text-ink2 text-sm sm:px-5">No tracks in this bucket yet.</div>
      ) : (
        <ul className="divide-y divide-line">
          {tracks.map((t) => {
            const path = `${vibe}/${t.name}`;
            const isDeleting = deleting === path;
            const isConfirming = confirmDel === path;
            return (
              <li
                key={t.name}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink text-sm">
                    {prettyTrackTitle(t.name)}
                  </div>
                  <div className="truncate font-mono text-ink2 text-xs">{t.name}</div>
                </div>
                {/** biome-ignore lint/a11y/useMediaCaption: royalty-free instrumental, no captions */}
                <audio controls preload="none" src={t.url} className="h-8 w-full sm:w-64">
                  <track kind="captions" />
                </audio>
                {isConfirming ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(path)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 font-medium text-white text-xs transition hover:bg-red-700 disabled:opacity-60"
                    >
                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : null}
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel(null)}
                      disabled={isDeleting}
                      className="rounded-full border border-line px-3 py-1 text-ink2 text-xs hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => setConfirmDel(path)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink2 transition hover:border-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
