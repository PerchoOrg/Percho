'use client';

/**
 * UploadSheet — upload flow shared by the mobile UploadFAB (BottomNav center)
 * and the desktop sidebar "+ New" trigger.
 *
 * Two source-picker UIs:
 *   - 'fan'   — radial menu around the FAB. Mobile FAB uses this.
 *               Center button = ✕ cancel. Tap scrim or ✕ to close.
 *   - 'sheet' — classic bottom sheet (fallback for desktop sidebar where
 *               there is no FAB to fan around).
 *
 * After files picked → type-picker bottom sheet (Listing / Community)
 * shared by both paths. Type-picker is a confirmation step with metadata,
 * not suited for the radial layout.
 *
 * Phase 45.10 (2026-06-21): source-picker fan layout (replaces the 4-rectangle
 * stacked sheet that was visually flat and required tapping Cancel to close).
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { stashFiles } from './upload-prefill-store';

type SheetState = 'closed' | 'fan-source' | 'sheet-source' | 'type-picker';

export function useUploadSheet() {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>('closed');
  const [files, setFiles] = useState<File[]>([]);
  const [fanReady, setFanReady] = useState(false);
  const albumRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  function open(mode: 'fan' | 'sheet' = 'sheet') {
    setSheet(mode === 'fan' ? 'fan-source' : 'sheet-source');
  }
  function close() {
    setSheet('closed');
    setFiles([]);
    setFanReady(false);
  }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setFiles(Array.from(list));
    setSheet('type-picker');
    setFanReady(false);
    e.target.value = '';
  }
  function pickType(type: 'listings' | 'communities') {
    if (files.length === 0) {
      close();
      return;
    }
    const id = stashFiles(files);
    close();
    router.push(`/dashboard/${type}/new?prefill=${encodeURIComponent(id)}`);
  }

  // Trigger the fan-out animation on next frame after mount so CSS transition fires.
  useEffect(() => {
    if (sheet === 'fan-source') {
      const t = requestAnimationFrame(() => setFanReady(true));
      return () => cancelAnimationFrame(t);
    }
  }, [sheet]);

  const portal = (
    <>
      <input ref={albumRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onFilesPicked} />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFilesPicked} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onFilesPicked} />

      {/* ─── Fan-out source picker (mobile FAB) ─── */}
      {sheet === 'fan-source' && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
          {/* fan center: matches UploadFAB position (BottomNav 64px tall, FAB -translate-y-3 = -12px) */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
          >
            <FanSatellite
              ready={fanReady}
              dx={-99}
              dy={-36}
              delayMs={0}
              label="Album"
              onClick={() => albumRef.current?.click()}
              icon={<AlbumIcon />}
            />
            <FanSatellite
              ready={fanReady}
              dx={0}
              dy={-105}
              delayMs={60}
              label="Photo"
              onClick={() => photoRef.current?.click()}
              icon={<PhotoIcon />}
            />
            <FanSatellite
              ready={fanReady}
              dx={99}
              dy={-36}
              delayMs={120}
              label="Video"
              onClick={() => videoRef.current?.click()}
              icon={<VideoIcon />}
            />
            {/* Center ✕ — covers the underlying FAB visually */}
            <button
              type="button"
              onClick={close}
              aria-label="Cancel upload"
              className="-translate-x-1/2 pointer-events-auto absolute bottom-0 left-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream shadow-lg shadow-black/20 transition active:scale-95"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      {/* ─── Classic bottom sheet (desktop "+ New" + type-picker) ─── */}
      {(sheet === 'sheet-source' || sheet === 'type-picker') && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-line border-t bg-bg p-4 pb-8"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            {sheet === 'sheet-source' && (
              <div className="space-y-2">
                <h2 className="px-2 pb-1 font-serif text-ink text-lg">Upload</h2>
                <SheetButton label="Choose from album" onClick={() => albumRef.current?.click()} />
                <SheetButton label="Video" onClick={() => videoRef.current?.click()} />
                <SheetButton label="Photo" onClick={() => photoRef.current?.click()} />
                <SheetButton label="Cancel" onClick={close} variant="muted" />
              </div>
            )}
            {sheet === 'type-picker' && (
              <div className="space-y-2">
                <h2 className="px-2 pb-1 font-serif text-ink text-lg">Upload as…</h2>
                <p className="px-2 pb-2 text-ink2 text-xs">
                  {files.length} file{files.length === 1 ? '' : 's'} selected
                </p>
                <SheetButton label="Listing" onClick={() => pickType('listings')} />
                <SheetButton label="Community" onClick={() => pickType('communities')} />
                <SheetButton label="Cancel" onClick={close} variant="muted" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  return { open, portal };
}

function FanSatellite({
  ready,
  dx,
  dy,
  delayMs,
  label,
  icon,
  onClick,
}: {
  ready: boolean;
  dx: number;
  dy: number;
  delayMs: number;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const transform = ready
    ? `translate(calc(-50% + ${dx}px), ${dy}px) scale(1)`
    : 'translate(-50%, 0) scale(0.4)';
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-1/2"
      style={{
        transform,
        opacity: ready ? 1 : 0,
        transition: `transform 220ms cubic-bezier(0.34, 1.4, 0.5, 1) ${delayMs}ms, opacity 160ms ease ${delayMs}ms`,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md shadow-black/15 transition active:scale-90"
        aria-label={label}
      >
        {icon}
      </button>
      <span
        className="-translate-x-1/2 absolute left-1/2 mt-2 whitespace-nowrap rounded-full bg-ink/80 px-2 py-0.5 text-[11px] text-cream"
        style={{ top: '100%' }}
      >
        {label}
      </span>
    </div>
  );
}

function SheetButton({
  label,
  onClick,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'muted';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border border-line px-4 py-3 text-left text-sm transition active:scale-[0.99] ${
        variant === 'muted' ? 'bg-bg text-ink2' : 'bg-surface text-ink hover:border-line-strong'
      }`}
    >
      {label}
    </button>
  );
}

function AlbumIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M3 14l5-5 4 4 3-3 6 6" />
    </svg>
  );
}
function PhotoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M22 7l-6 5 6 5z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
