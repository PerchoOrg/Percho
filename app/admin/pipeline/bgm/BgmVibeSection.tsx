'use client';

/**
 * BgmVibeSection — one vibe: tracks with approve/reject buttons + section
 * Import (curated web pool) + Upload (local files).
 *
 * Phase 105: per-section Upload + per-row Delete.
 * Phase 106: Delete → Reject (soft), Upload rebranded to Import.
 * Phase 107 (2026-07-17):
 *   - Row has BOTH Approve + Reject buttons; the active state is highlighted
 *     so the operator sees the current call at a glance and can flip it in
 *     one click.
 *   - Section header has TWO buttons: **Import** (opens a picker of Kevin
 *     MacLeod tracks not yet in the bucket; server fetches from incompetech
 *     and uploads) and **Upload** (local file picker — this is what Phase
 *     106 called "Import").
 */

import { BGM_VIBE_META, type BgmVibe, prettyTrackTitle } from '@/lib/bgm/storage';
import { CheckCircle2, Globe, Loader2, Upload, X, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type BgmTrack = { name: string; url: string; rejected: boolean };
type Candidate = {
  title: string;
  filename: string;
  feel: string | null;
  bpm: string | null;
  instruments: string | null;
  length: string | null;
  slug: string;
  previewUrl: string;
};

export function BgmVibeSection({ vibe, tracks }: { vibe: BgmVibe; tracks: BgmTrack[] }) {
  const meta = BGM_VIBE_META[vibe];
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);

  const approved = tracks.filter((t) => !t.rejected);
  const rejected = tracks.filter((t) => t.rejected);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const fileList = Array.from(files);
      // Step 1: ask the server for signed upload URLs (one per file). This is a
      // tiny JSON request, so it's safe against Vercel's ~4.5MB serverless body
      // cap (the cap is what caused the old multipart route to return a plain
      // "Request Entity Too Large" text response that broke res.json()).
      const signRes = await fetch('/api/admin/bgm/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vibe, filenames: fileList.map((f) => f.name) }),
      });
      if (!signRes.ok) {
        const text = await signRes.text();
        throw new Error(`sign failed (${signRes.status}): ${text.slice(0, 200)}`);
      }
      const signJson = (await signRes.json()) as {
        results: Array<
          | { file: string; status: 'ok'; path: string; token: string }
          | { file: string; status: 'error'; error: string }
        >;
      };

      // Step 2: upload each file's bytes DIRECTLY to Supabase Storage from the
      // browser, using the signed token. No Vercel round-trip for the payload.
      const { createClient } = await import('@/lib/supabase/client');
      const supa = createClient();
      const errors: string[] = [];
      let uploaded = 0;
      for (const f of fileList) {
        const type = f.type || 'audio/mpeg';
        if (!type.startsWith('audio/')) {
          errors.push(`${f.name}: not audio (${type})`);
          continue;
        }
        const signed = signJson.results.find((r) => r.file === f.name);
        if (!signed || signed.status !== 'ok') {
          errors.push(`${f.name}: ${signed && 'error' in signed ? signed.error : 'no signed url'}`);
          continue;
        }
        const { error } = await supa.storage
          .from('bgm')
          .uploadToSignedUrl(signed.path, signed.token, f, { contentType: 'audio/mpeg' });
        if (error) {
          errors.push(`${f.name}: ${error.message}`);
          continue;
        }
        uploaded += 1;
      }
      if (uploaded === 0) throw new Error(errors[0] ?? 'upload failed');
      if (fileInput.current) fileInput.current.value = '';
      if (errors.length > 0) setError(`Partial: ${errors.join('; ')}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleSetRejected(path: string, next: boolean) {
    setError(null);
    setBusyPath(path);
    try {
      const res = await fetch('/api/admin/bgm/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, rejected: next }),
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 text-ink2 text-xs">
            <span className="font-medium text-ink">{approved.length}</span> approved
            {rejected.length > 0 ? (
              <>
                {' '}· <span className="text-ink2">{rejected.length} rejected</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setImporterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg px-3 py-1 font-medium text-ink text-xs transition hover:border-ink2"
          >
            <Globe size={12} />
            Import
          </button>
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
        <div className="px-4 py-6 text-ink2 text-sm sm:px-5">
          No tracks yet — click <b>Import</b> to pull from the curated web pool or{' '}
          <b>Upload</b> to add your own.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {approved.map((t) => (
            <TrackRow
              key={t.name}
              track={t}
              vibe={vibe}
              busy={busyPath === `${vibe}/${t.name}`}
              onApprove={() => handleSetRejected(`${vibe}/${t.name}`, false)}
              onReject={() => handleSetRejected(`${vibe}/${t.name}`, true)}
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
              onApprove={() => handleSetRejected(`${vibe}/${t.name}`, false)}
              onReject={() => handleSetRejected(`${vibe}/${t.name}`, true)}
            />
          ))}
        </ul>
      )}

      {importerOpen ? (
        <ImportPicker vibe={vibe} onClose={() => setImporterOpen(false)} onDone={() => router.refresh()} />
      ) : null}
    </section>
  );
}

function TrackRow({
  track,
  vibe,
  busy,
  onApprove,
  onReject,
}: {
  track: BgmTrack;
  vibe: BgmVibe;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isRejected = track.rejected;
  return (
    <li
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
        isRejected ? 'bg-cream/20' : ''
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
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || !isRejected}
          aria-pressed={!isRejected}
          className={
            !isRejected
              ? 'inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2.5 py-1 font-medium text-green-700 text-xs disabled:cursor-default'
              : 'inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-1 font-medium text-ink2 text-xs transition hover:border-green-600 hover:text-green-700 disabled:opacity-60'
          }
        >
          {busy && isRejected ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy || isRejected}
          aria-pressed={isRejected}
          className={
            isRejected
              ? 'inline-flex items-center gap-1 rounded-full border border-red-500 bg-red-50 px-2.5 py-1 font-medium text-red-600 text-xs disabled:cursor-default'
              : 'inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-1 font-medium text-ink2 text-xs transition hover:border-red-500 hover:text-red-600 disabled:opacity-60'
          }
        >
          {busy && !isRejected ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Reject
        </button>
      </div>
    </li>
  );
}

function ImportPicker({
  vibe,
  onClose,
  onDone,
}: {
  vibe: BgmVibe;
  onClose: () => void;
  onDone: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); // by filename
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Debounced search (250ms).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const url = `/api/admin/bgm/candidates?vibe=${encodeURIComponent(vibe)}&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error ?? 'load failed');
        setCandidates(json.results as Candidate[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [vibe, query]);

  function toggle(filename: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }

  async function runImport() {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch('/api/admin/bgm/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vibe, filenames: Array.from(selected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'import failed');
      const errCount = (json.results ?? []).filter((r: { status: string }) => r.status === 'error').length;
      setSummary(`Imported ${json.imported} · errors ${errCount}`);
      onDone();
      setSelected(new Set());
      // Refresh candidate list so imported ones disappear.
      const res2 = await fetch(
        `/api/admin/bgm/candidates?vibe=${encodeURIComponent(vibe)}&q=${encodeURIComponent(query)}`,
      );
      const json2 = await res2.json();
      setCandidates(json2.results as Candidate[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-bg shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-line border-b px-4 py-3">
          <div>
            <div className="font-semibold text-ink text-sm">Import from incompetech</div>
            <div className="text-ink2 text-xs">
              Kevin MacLeod catalog · CC-BY 4.0 · vibe: <b>{vibe}</b> · already-imported tracks are hidden
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink2 hover:bg-cream hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-line border-b px-4 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, feel (calming, upbeat, bouncy…), instrument, genre"
            className="w-full rounded border border-line bg-bg px-3 py-1.5 text-ink text-sm outline-none focus:border-ink2"
          />
          <div className="mt-1 text-ink2 text-xs">
            {searching
              ? 'Searching…'
              : candidates
                ? `${candidates.length} match${candidates.length === 1 ? '' : 'es'} · ▶ preview inline before importing`
                : ''}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error ? (
            <div className="mx-2 mb-2 rounded bg-red-50 px-3 py-2 text-red-700 text-xs">{error}</div>
          ) : null}
          {summary ? (
            <div className="mx-2 mb-2 rounded bg-green-50 px-3 py-2 text-green-700 text-xs">
              {summary}
            </div>
          ) : null}

          {candidates === null ? (
            <div className="flex items-center gap-2 px-2 py-8 text-ink2 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading catalog…
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-2 py-8 text-center text-ink2 text-sm">
              No matches. Try broader terms — "acoustic", "corporate", "ambient".
            </div>
          ) : (
            <ul className="space-y-1">
              {candidates.map((c) => {
                const checked = selected.has(c.filename);
                return (
                  <li
                    key={c.filename}
                    className={`rounded px-2 py-2 ${checked ? 'bg-cream' : 'hover:bg-cream/50'}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.filename)}
                        className="mt-1"
                        aria-label={`Select ${c.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink text-sm">{c.title}</div>
                        <div className="truncate text-ink2 text-xs">
                          {c.feel ? <span>{c.feel}</span> : null}
                          {c.bpm && c.bpm !== '0' ? <span> · {c.bpm} BPM</span> : null}
                          {c.length ? <span> · {c.length}</span> : null}
                          {c.instruments ? <span> · {c.instruments}</span> : null}
                        </div>
                      </div>
                      {/** biome-ignore lint/a11y/useMediaCaption: royalty-free instrumental */}
                      <audio controls preload="none" src={c.previewUrl} className="h-7 w-48 shrink-0">
                        <track kind="captions" />
                      </audio>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-line border-t px-4 py-3">
          <div className="text-ink2 text-xs">
            {selected.size > 0 ? `${selected.size} selected` : 'Select tracks to import'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line bg-bg px-3 py-1 font-medium text-ink2 text-xs hover:border-ink2"
            >
              Close
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={selected.size === 0 || importing}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 font-medium text-bg text-xs disabled:opacity-50"
            >
              {importing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
              {importing ? 'Fetching…' : `Import${selected.size ? ` ${selected.size}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
