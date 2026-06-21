'use client';

/**
 * StatusPill — Active/Inactive toggle in the hero of the agent hub
 * detail pages (Phase 46).
 *
 * Click flips status. For listings the activation gate may surface
 * missing-field errors (address/price/beds/baths/at least one ready
 * media); the pill renders those inline below itself.
 *
 * Wraps the toggle action in a transition so the page stays interactive
 * (other tabs remain clickable while the pill is pending). Calls
 * `flushPending()` from the auto-save registry first so any in-flight
 * EditListingForm debounce is committed before status changes — prevents
 * a "you must enter price" error on a price the user just typed.
 *
 * Stacking-context note (per phase 45.33 lesson): the pill renders inside
 * the hero `<header>` which sits inside a fixed-position layout shell.
 * The error popover uses `createPortal(node, document.body)` to escape
 * the BottomNav z-40 ceiling on mobile.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { flushPending } from '@/app/dashboard/listings/[id]/edit/flush-registry';
import {
  publishListing,
  unpublishListing,
} from '@/app/dashboard/listings/[id]/edit/publish-actions';

type Variant = 'listing' | 'community';

type Props = {
  /** Listing or community id, depending on variant. */
  id: string;
  /** Current status: 'active' | 'inactive'. */
  status: string;
  variant: Variant;
  /** Provided when variant='community' so the pill can call the
   * community status server actions without a circular import. */
  setCommunityStatus?: (
    id: string,
    status: 'active' | 'inactive',
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const MISSING_LABELS: Record<string, string> = {
  address: 'Property address',
  price: 'List price > $0',
  beds: 'Bedrooms',
  baths: 'Bathrooms',
  'at least one ready video or photo': '≥1 ready video or photo',
  'at least one ready video': '≥1 ready video',
};

export function StatusPill({ id, status, variant, setCommunityStatus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);

  const isActive = status === 'active';

  function clearErrors() {
    setMissing(null);
    setErr(null);
    setPopoverPos(null);
  }

  function showErrorAnchored() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPopoverPos({
      top: r.bottom + window.scrollY + 8,
      left: Math.max(8, Math.min(window.innerWidth - 320, r.right - 320 + window.scrollX)),
    });
  }

  function handleToggle() {
    clearErrors();
    startTransition(async () => {
      try {
        flushPending();
      } catch {
        // No pending form on this page — ignore.
      }

      if (variant === 'listing') {
        if (!isActive) {
          const res = await publishListing(id);
          if (res.ok) {
            router.refresh();
          } else {
            setMissing(res.missing);
            showErrorAnchored();
          }
        } else {
          const res = await unpublishListing(id);
          if (res.ok) router.refresh();
          else {
            setErr(res.error);
            showErrorAnchored();
          }
        }
      } else {
        if (!setCommunityStatus) {
          setErr('Community status action not wired up');
          showErrorAnchored();
          return;
        }
        const res = await setCommunityStatus(id, isActive ? 'inactive' : 'active');
        if (res.ok) router.refresh();
        else {
          setErr(res.error);
          showErrorAnchored();
        }
      }
    });
  }

  // Auto-clear error popover on outside click.
  useEffect(() => {
    if (!popoverPos) return;
    function onClick() {
      clearErrors();
    }
    const t = window.setTimeout(() => {
      window.addEventListener('click', onClick, { once: true });
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', onClick);
    };
  }, [popoverPos]);

  const dotCls = isActive ? 'bg-emerald-500' : 'bg-ink2/40';
  const labelCls = isActive
    ? 'text-ink'
    : 'text-ink2';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-busy={pending}
        className={`group inline-flex items-center gap-2 rounded-full border border-line bg-bg/95 px-3 py-1.5 text-xs font-medium uppercase tracking-wider backdrop-blur transition hover:border-line-strong disabled:opacity-60 ${labelCls}`}
        title={isActive ? 'Click to deactivate' : 'Click to activate'}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotCls}`} />
        {pending ? '…' : isActive ? 'Active' : 'Inactive'}
        <span className="text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
          {isActive ? '→ deactivate' : '→ activate'}
        </span>
      </button>

      {popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            // Portal escape so BottomNav z-40 doesn't clip the popover.
            className="absolute z-[100] w-[300px] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {missing && missing.length > 0 ? (
              <>
                <p className="mb-2 font-medium text-ink">
                  Almost there — fill in the missing fields:
                </p>
                <ul className="space-y-1 text-ink2">
                  {missing.map((m) => (
                    <li key={m} className="flex gap-2">
                      <span aria-hidden>•</span>
                      <span>{MISSING_LABELS[m] ?? m}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : err ? (
              <p className="text-ink2">{err}</p>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}
