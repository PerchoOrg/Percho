'use client';

/**
 * BgmVibeSection — one vibe's tracks with per-row approve/reject + section import.
 *
 * Phase 105: per-section Upload + per-row Delete.
 * Phase 106 (2026-07-17): Delete → Reject (soft, mp3 stays in Storage).
 *   Upload → Import (same multipart POST, clearer label).
 *   Rejected tracks render below approved ones, dimmed, with an Approve toggle.
 */

import { BGM_VIBE_META, type BgmVibe, prettyTrackTitle } from '@/lib/bgm/storage';
import { CheckCircle2, Loader2, Upload, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export type BgmTrack = { name: string; url: string; rejected: boolean };

export function BgmVibeSection({ vibe, tracks }: { vibe: BgmVibe; tracks: BgmTrack[] }) {
  const meta = BGM_VIBE_META[vibe];
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approved = tracks.filter((t) => !t.rejected);
  const rejected = tracks.filter((t) => t.rejected);

  async function handleImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('vibe', vibe);
      for (const f of Array.from(files)) fd.append('files', f);
      const res = await fetch('/api/admin/bgm/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || json.uploaded === 0) {
        const first = json?.results?.find((r: { status: string }) => r.status === 'error');
        throw new Error(first?.error ?? json?.error ?? 'import failed');
      }
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleReject(path: string, rejected: boolean) {
    setError(null);
    setBusyPath(path);
    try {
      const res = await fetch('/api/admin/bgm/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, rejected }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'update failed');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
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
            <span className="font-medium text-ink">{approved.length}</span> approved
            {rejected.length > 0 ? (
              <>
                {' '}· <span className="text-ink2">{rejected.length} rejected</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1 font-medium text-ink text-xs transition hover:border-ink2 disabled:opacity-60"
          >
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {importing ? 'Importing…' : 'Import'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/mpeg,audio/mp3,.mp3"
            multiple
            className="hidden"
            onChange={(e) => handleImport(e.target.files)}
          />
        </div>
      </div>

      {error ? (
        <div className="border-line border-b bg-red-50 px-4 py-2 text-red-700 text-xs sm:px-5">
          {error}
        </div>
      ) : null}

      {tracks.length === 0 ? (
        <div className="px-4 py-6 text-ink2 text-sm sm:px-5">
          No tracks yet — click Import to add one.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {approved.map((t) => (
            <TrackRow
              key={t.name}
              track={t}
              vibe={vibe}
              busy={busyPath === `${vibe}/${t.name}`}
              onReject={() => handleReject(`${vibe}/${t.name}`, true)}
            />
          ))}
          {rejected.length > 0 ? (
            <li className="bg-cream/30 px-4 py-2 text-ink2 text-xs sm:px-5">
              Rejected — worker skips these
            </li>
          ) : null}
          {rejected.map((t) => (
            <TrackRow
              key={t.name}
              track={t}
              vibe={vibe}
              busy={busyPath === `${vibe}/${t.name}`}
              onReject={() => handleReject(`${vibe}/${t.name}`, false)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrackRow({
  track,
  vibe,
  busy,
  onReject,
}: {
  track: BgmTrack;
  vibe: BgmVibe;
  busy: boolean;
  onReject: () => void;
}) {
  const isRejected = track.rejected;
  return (
    <li
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
        isRejected ? 'bg-cream/20 opacity-70' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`truncate font-medium text-sm ${isRejected ? 'text-ink2 line-through' : 'text-ink'}`}
        >
          {prettyTrackTitle(track.name)}
        </div>
        <div className="truncate font-mono text-ink2 text-xs">
          {vibe}/{track.name}
        </div>
      </div>
      {/** biome-ignore lint/a11y/useMediaCaption: royalty-free instrumental, no captions */}
      <audio controls preload="none" src={track.url} className="h-8 w-full sm:w-64">
        <track kind="captions" />
      </audio>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className={
          isRejected
            ? 'inline-flex items-center gap-1 rounded-full border border-green-600 bg-white px-3 py-1 font-medium text-green-700 text-xs transition hover:bg-green-50 disabled:opacity-60'
            : 'inline-flex items-center gap-1 rounded-full border border-line bg-bg px-3 py-1 font-medium text-ink2 text-xs transition hover:border-red-500 hover:text-red-600 disabled:opacity-60'
        }
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : isRejected ? (
          <CheckCircle2 size={12} />
        ) : (
          <XCircle size={12} />
        )}
        {isRejected ? 'Approve' : 'Reject'}
      </button>
    </li>
  );
}
