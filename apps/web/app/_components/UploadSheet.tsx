'use client';

/**
 * UploadSheet — bottom-sheet "create" entry point shared by the mobile
 * UploadFAB (BottomNav center) and the desktop sidebar "+ New" trigger.
 *
 * Phase 52 (2026-06-24): collapsed from a 2-step flow (Album/Camera →
 * file picker → type picker) into a single type-picker. The agent now
 * answers ONE question — "Listing or Community?" — and lands on the
 * detail page of a freshly stubbed row. Photos and video upload from
 * the Media tab on that page, never from this sheet.
 *
 * Why:
 *   - Agents don't randomly snap-and-post like TikTok. They want to
 *     create an entity, then fill it in.
 *   - The previous flow asked for source (Album/Camera) BEFORE asking
 *     what kind of entity, which forced the agent to either tap-cancel
 *     or pre-pick photos for an entity that didn't exist yet.
 *
 * Stubs:
 *   - Listing  → `createStubListing()`  → `/dashboard/listings/[id]/edit`
 *   - Community → `createStubCommunity()` → `/dashboard/communities/[id]`
 *
 * Stacking-context note (preserved from p45.33): the sheet portals to
 * document.body via createPortal so its z-50 escapes BottomNav's z-40
 * stacking context — otherwise listing cards / video player tap-eat
 * the scrim.
 */

import { createStubCommunity } from '@/app/dashboard/communities/actions';
import { createStubListing } from '@/app/dashboard/listings/actions';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type SheetState = 'closed' | 'type-picker';

export function useUploadSheet() {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>('closed');
  const [mounted, setMounted] = useState(false);

  // SSR-safe portal mount flag. createPortal requires document, which
  // doesn't exist on the server — so we only render the portal after
  // the component mounts on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  const [creating, setCreating] = useState<'listings' | 'communities' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function open() {
    setSheet('type-picker');
    setCreateError(null);
  }
  function close() {
    setSheet('closed');
    setCreateError(null);
  }

  async function pickType(type: 'listings' | 'communities') {
    if (creating) return;
    setCreateError(null);
    setCreating(type);
    try {
      if (type === 'listings') {
        const result = await createStubListing();
        if (!result.ok) {
          setCreateError('Could not create listing — please retry.');
          return;
        }
        close();
        router.push(`/dashboard/listings/${result.data.id}/edit`);
        return;
      }
      const result = await createStubCommunity();
      if (!result.ok) {
        setCreateError('Could not create neighborhood — please retry.');
        return;
      }
      close();
      router.push(`/dashboard/communities/${result.data.id}`);
    } finally {
      setCreating(null);
    }
  }

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
        <div className="px-5 pt-3 pb-3">
          <h2 className="pb-1 text-center font-serif text-ink text-lg">What are you creating?</h2>
          <p className="pb-3 text-center text-ink2 text-[11px]">Tap outside to cancel</p>
          <div className="grid grid-cols-2 gap-3">
            <TypeTile
              label="Listing"
              hint="A property you're selling"
              loading={creating === 'listings'}
              disabled={creating !== null}
              onClick={() => {
                void pickType('listings');
              }}
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
                  <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />
                </svg>
              }
            />
            <TypeTile
              label="Neighborhood"
              hint="A neighborhood you cover"
              loading={creating === 'communities'}
              disabled={creating !== null}
              onClick={() => {
                void pickType('communities');
              }}
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
                  <circle cx="9" cy="11" r="3" />
                  <circle cx="17" cy="9" r="2.5" />
                  <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                  <path d="M14 20c0-2.3 1.7-4 3.5-4s3.5 1.7 3.5 4" />
                </svg>
              }
            />
          </div>
          {createError ? (
            <p className="px-1 pt-3 text-center text-[11px] text-rose-600">{createError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  const portal = <>{mounted && sheetUI ? createPortal(sheetUI, document.body) : null}</>;

  return { open, portal };
}

function TypeTile({
  label,
  hint,
  loading,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  hint: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-bg px-4 py-6 text-ink transition active:scale-[0.97] hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-ink">{icon}</span>
      <span className="font-medium text-sm">{loading ? 'Creating…' : label}</span>
      <span className="text-ink2 text-[11px]">{hint}</span>
    </button>
  );
}
