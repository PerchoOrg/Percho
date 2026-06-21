'use client';

/**
 * CommunityDetailMenu — overflow menu in the community detail hero.
 * Phase 46: Delete only. Same portal pattern as ListingDetailMenu.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { deleteCommunityAction } from './status-actions';

export function CommunityDetailMenu({ communityId }: { communityId: string }) {
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
      left: Math.max(8, r.right - 200 + window.scrollX),
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
        'Permanently delete this community? Videos, photos and analytics for it will be removed. This cannot be undone.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCommunityAction(communityId);
      if (res.ok) {
        router.push('/dashboard/communities');
      } else {
        alert(res.error);
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
            className="absolute z-[100] w-[200px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="block w-full px-3 py-2 text-left text-rose-500 text-sm transition hover:bg-rose-500/10 disabled:opacity-60"
            >
              {pending ? 'Deleting…' : 'Delete community'}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
