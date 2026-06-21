'use client';

/**
 * ListingDetailMenu — overflow menu in the listing detail hero.
 *
 * Phase 46: archive is gone. Delete is the only destructive action,
 * tucked behind the ⋮ menu so the hero stays clean.
 *
 * Stacking-context guard (per phase 45.33 lesson): the menu sheet is
 * portalled to document.body so the BottomNav z-40 fixed shell doesn't
 * cap our z-index.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { deleteListingAndRedirect } from './archive-actions';

export function ListingDetailMenu({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function toggle() {
    if (open) {
      setOpen(false);
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + window.scrollY + 6,
      left: Math.max(8, r.right - 180 + window.scrollX),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      setOpen(false);
      setPos(null);
    }
    const t = window.setTimeout(() => {
      window.addEventListener('click', onClick);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', onClick);
    };
  }, [open]);

  function handleDelete() {
    if (
      !confirm(
        'Permanently delete this listing? Videos, photos, leads and analytics will be removed. This cannot be undone.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteListingAndRedirect(listingId);
        // redirect throws — if we reach here we somehow returned silently.
        router.refresh();
      } catch (e) {
        // Next.js redirect() throws a sentinel — re-throw it.
        if (e && typeof e === 'object' && 'digest' in e) throw e;
        alert(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-label="More actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-bg/95 text-ink2 backdrop-blur transition hover:border-line-strong hover:text-ink"
      >
        <span aria-hidden className="text-base leading-none">⋯</span>
      </button>
      {open &&
        pos &&
        mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="absolute z-[100] w-[180px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="block w-full px-3 py-2 text-left text-rose-500 text-sm transition hover:bg-rose-500/10 disabled:opacity-60"
            >
              {pending ? 'Deleting…' : 'Delete listing'}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
