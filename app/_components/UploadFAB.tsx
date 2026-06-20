'use client';

/**
 * UploadFAB — center FAB in the agent BottomNav (mobile only).
 *
 * Tap → bottom-sheet picker (Choose from album / Video / Photo) → type picker.
 * Sheet logic lives in <useUploadSheet> so DesktopSidebar's "+ New" button
 * can use the same flow.
 *
 * Phase 43.6 (2026-06-20). Phase 45.9 (2026-06-20): sheet extracted to
 * UploadSheet hook.
 */

import { Plus } from 'lucide-react';
import { useUploadSheet } from './UploadSheet';

export function UploadFAB() {
  const { open, portal } = useUploadSheet();
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Upload"
        className="mx-auto -translate-y-3 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream shadow-lg shadow-black/20 transition active:scale-95"
      >
        <Plus size={24} aria-hidden="true" strokeWidth={2} />
      </button>
      {portal}
    </>
  );
}
