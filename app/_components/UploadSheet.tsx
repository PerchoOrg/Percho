'use client';

/**
 * UploadSheet — bottom-sheet upload flow shared by the mobile UploadFAB
 * (BottomNav center) and the desktop sidebar "+ New" trigger.
 *
 * Source picker: 2 large icon tiles ("Album" / "Camera") + scrim-tap to
 * cancel (with a hint label). No explicit Cancel button — the scrim is
 * the cancel affordance.
 *
 * After files picked → type-picker bottom sheet (Listing / Community).
 *
 * Phase 45.32 (2026-06-21): reverted from radial fan back to bottom sheet
 * per qiaoxux. Source picker collapsed to album / camera / cancel.
 * Phase 45.33 (2026-06-21): bug fix — sheet was rendered inside BottomNav
 * (z-40 stacking context), so its z-50 only beat siblings inside that
 * bar. Page-level cards (listing tiles, video player) sat ABOVE the
 * scrim and ate the tap, opening the wrong screen. Fix: render the
 * portal to document.body via createPortal so the sheet escapes the
 * BottomNav stacking context. Also redesigned visuals: 2 icon tiles
 * (Album / Camera) instead of 4 plain buttons, and dropped the Cancel
 * row in favor of a "Tap outside to cancel" hint — qiaoxux feedback
 * the original sheet was 太难看 and required tapping Cancel.
 */

import { createStubCommunity } from '@/app/dashboard/communities/actions';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { stashFiles } from './upload-prefill-store';
import { setUploadTotal } from './upload-status-store';

type SheetState = 'closed' | 'source-picker' | 'type-picker';

export function useUploadSheet() {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>('closed');
  const [files, setFiles] = useState<File[]>([]);
  const [mounted, setMounted] = useState(false);
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // SSR-safe portal mount flag. createPortal requires document, which
  // doesn't exist on the server — so we only render the portal after
  // the component mounts on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function open() {
    setSheet('source-picker');
  }
  function close() {
    setSheet('closed');
    setFiles([]);
    setCreateError(null);
  }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setFiles(Array.from(list));
    setSheet('type-picker');
    e.target.value = '';
  }
  async function pickType(type: 'listings' | 'communities') {
    if (files.length === 0) {
      close();
      return;
    }
    if (type === 'listings') {
      const id = stashFiles(files);
      close();
      router.push(`/dashboard/listings/new?prefill=${encodeURIComponent(id)}`);
      return;
    }
    // Phase 50.17 (2026-06-23): communities go straight to a stub hub —
    // no /new form. Create the row server-side, stash the files, push to
    // /communities/[id]?prefill=… and let the eager-mounted Media tab
    // auto-upload while the agent edits Details.
    setCreateError(null);
    setCreating(true);
    try {
      const result = await createStubCommunity();
      if (!result.ok) {
        setCreateError('Could not create — please retry.');
        return;
      }
      const prefillId = stashFiles(files);
      setUploadTotal(result.data.id, files.length);
      close();
      router.push(
        `/dashboard/communities/${result.data.id}?prefill=${encodeURIComponent(prefillId)}`,
      );
    } finally {
      setCreating(false);
    }
  }

  // The hidden file inputs stay in the local component tree (they need
  // to live on the page so refs work). Only the visual sheet+scrim
  // portals to body — that's all that needs to escape BottomNav's
  // stacking context.
  const sheetUI = sheet !== 'closed' && (
    <div className="fixed inset-0 z-[80]">
      {/* Scrim is a full-area <button>: catches the tap, closes the
          sheet, and (because button click doesn't propagate to
          elements underneath in z-order) does NOT activate any
          listing card / video that happens to be visually behind it. */}
      <button
        type="button"
        aria-label="Close upload sheet"
        onClick={close}
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-in fade-in duration-150"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface shadow-[0_-8px_32px_rgba(0,0,0,0.18)] animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-ink2 transition active:scale-95 hover:bg-bg hover:text-ink"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {sheet === 'source-picker' && (
          <div className="px-5 pt-3 pb-3">
            <h2 className="pb-3 text-center font-serif text-ink text-lg">Add video or photos</h2>
            <div className="grid grid-cols-2 gap-3">
              <SourceTile
                label="Album"
                hint="Pick from library"
                onClick={() => albumRef.current?.click()}
                icon={
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                }
              />
              <SourceTile
                label="Camera"
                hint="Take photo or video"
                onClick={() => cameraRef.current?.click()}
                icon={
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                }
              />
            </div>
          </div>
        )}
        {sheet === 'type-picker' && (
          <div className="space-y-2 px-4 pt-3 pb-2">
            <h2 className="px-2 pb-1 font-serif text-ink text-lg">Upload as…</h2>
            <p className="px-2 pb-2 text-ink2 text-xs">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </p>
            <SheetRow
              label="Listing"
              onClick={() => {
                void pickType('listings');
              }}
              disabled={creating}
            />
            <SheetRow
              label={creating ? 'Creating community…' : 'Community'}
              onClick={() => {
                void pickType('communities');
              }}
              disabled={creating}
            />
            {createError ? (
              <p className="px-2 pt-1 text-[11px] text-rose-600">{createError}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const portal = (
    <>
      {/* Album: explicit extensions instead of image/*,video/* — on some
          iOS Safari versions the wildcard MIME forces the system 3-way
          action sheet (Photo Library / Take Photo / Choose Files) but
          explicit extensions can route directly into the Photos picker.
          Not guaranteed across iOS versions — see Phase 45.36 DEVLOG. */}
      <input
        ref={albumRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.mp4,.mov,.m4v"
        multiple
        className="hidden"
        onChange={onFilesPicked}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={onFilesPicked}
      />
      {mounted && sheetUI ? createPortal(sheetUI, document.body) : null}
    </>
  );

  return { open, portal };
}

function SourceTile({
  label,
  hint,
  onClick,
  icon,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-bg px-4 py-6 text-ink transition active:scale-[0.97] hover:border-line-strong"
    >
      <span className="text-ink">{icon}</span>
      <span className="font-medium text-sm">{label}</span>
      <span className="text-ink2 text-[11px]">{hint}</span>
    </button>
  );
}

function SheetRow({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-left text-ink text-sm transition active:scale-[0.99] hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}
