'use client';

/**
 * UploadSheet — bottom-sheet upload flow shared by the mobile UploadFAB
 * (BottomNav center) and the desktop sidebar "+ New" trigger.
 *
 * Flow:
 *   1. open() → source picker (Choose from album / Video / Photo)
 *   2. files picked → type picker (Listing / Community)
 *   3. type chosen → stash files, route to /dashboard/<type>/new?prefill=<id>
 *
 * Phase 45.9 (2026-06-20): extracted from UploadFAB so DesktopSidebar's
 * NewDropdown can fire the same picker the mobile FAB uses.
 */

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { stashFiles } from './upload-prefill-store';

type SheetState = 'closed' | 'source-picker' | 'type-picker';

export function useUploadSheet() {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>('closed');
  const [files, setFiles] = useState<File[]>([]);
  const albumRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  function open() {
    setSheet('source-picker');
  }
  function close() {
    setSheet('closed');
    setFiles([]);
  }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setFiles(Array.from(list));
    setSheet('type-picker');
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

  const portal = (
    <>
      <input ref={albumRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onFilesPicked} />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFilesPicked} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={onFilesPicked} />
      {sheet !== 'closed' && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-line border-t bg-bg p-4 pb-8"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            {sheet === 'source-picker' && (
              <div className="space-y-2">
                <h2 className="px-2 pb-1 font-serif text-lg text-ink">Upload</h2>
                <SheetButton label="Choose from album" onClick={() => albumRef.current?.click()} />
                <SheetButton label="Video" onClick={() => videoRef.current?.click()} />
                <SheetButton label="Photo" onClick={() => photoRef.current?.click()} />
                <SheetButton label="Cancel" onClick={close} variant="muted" />
              </div>
            )}
            {sheet === 'type-picker' && (
              <div className="space-y-2">
                <h2 className="px-2 pb-1 font-serif text-lg text-ink">Upload as…</h2>
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
