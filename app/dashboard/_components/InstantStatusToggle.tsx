'use client';

/**
 * InstantStatusToggle — one-click active/inactive switch for the hero of
 * listing AND community detail pages.
 *
 * Behavior:
 *   - Active → Inactive: fires the deactivate action immediately, no confirm.
 *   - Inactive → Active: fires the activate action. For listings, validation
 *     may surface missing-fields (price/beds/baths/media); we render those
 *     inline in a portaled popover. Communities have no publish gate.
 *
 * The chromeless variant blends into the cover image; an "outline" variant is
 * kept for places that need a visible chip.
 *
 * `kind` selects which server actions to call. The shared toggle UX (instant
 * flip, missing-field popover, frosted-hover) used to live only on listings;
 * communities had a heavier `StatusPill` that didn't match the listing hero
 * visual language. Phase 50 collapsed both into this single component.
 */

import { setCommunityStatus } from '@/app/dashboard/communities/[id]/status-actions';
import { flushPending } from '@/app/dashboard/listings/[id]/edit/flush-registry';
import {
  publishListing,
  unpublishListing,
} from '@/app/dashboard/listings/[id]/edit/publish-actions';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

const MISSING_LABELS: Record<string, string> = {
  address: 'Property address',
  price: 'List price > $0',
  beds: 'Bedrooms',
  baths: 'Bathrooms',
  'at least one ready video or photo': '≥1 ready video or photo',
  'at least one ready video': '≥1 ready video',
  // Community activate gate:
  name: 'Neighborhood name',
  city: 'City',
  state: 'State',
  'at least one photo or ready video': '≥1 photo or ready video',
};

type Kind = 'listing' | 'community';

type Props = {
  id: string;
  status: string;
  kind?: Kind;
  variant?: 'hero' | 'outline';
};

export function InstantStatusToggle({ id, status, kind = 'listing', variant = 'hero' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const isActive = status === 'active';

  function clearErrors() {
    setMissing(null);
    setErr(null);
    setPos(null);
  }

  function showAt() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
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
        // no pending form on this page — ignore.
      }
      if (kind === 'listing') {
        if (isActive) {
          const res = await unpublishListing(id);
          if (res.ok) router.refresh();
          else {
            setErr(res.error);
            showAt();
          }
        } else {
          const res = await publishListing(id);
          if (res.ok) router.refresh();
          else {
            setMissing(res.missing);
            showAt();
          }
        }
      } else {
        // community: activate gate mirrors the listing publish
        // gate — name/city/state + ≥1 media. Deactivate is unconditional.
        const res = await setCommunityStatus(id, isActive ? 'inactive' : 'active');
        if (res.ok) router.refresh();
        else {
          if (res.missing && res.missing.length > 0) setMissing(res.missing);
          else setErr(res.error);
          showAt();
        }
      }
    });
  }

  // Outside-click closes the popover.
  useEffect(() => {
    if (!pos) return;
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
  }, [pos]);

  // Hero variant: chromeless, white text + scrim shadow, hover frosted glass.
  // Outline variant: explicit pill (used outside hero, e.g. dashboard cards).
  const isHero = variant === 'hero';
  const cls = isHero
    ? `inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-[12.5px] text-surface transition-all duration-150 hover:border-white/25 hover:bg-white/20 hover:shadow-[0_2px_12px_rgba(0,0,0,0.18)] hover:backdrop-blur-md hover:[text-shadow:none] active:scale-[0.97] disabled:opacity-60`
    : `inline-flex items-center gap-2 rounded-full border border-line bg-bg/95 px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition hover:border-line-strong disabled:opacity-60 ${
        isActive ? 'text-ink' : 'text-ink2'
      }`;
  const dotCls = isActive ? 'bg-emerald-500' : isHero ? 'bg-gray-400' : 'bg-ink2/40';

  const noun = kind === 'community' ? 'neighborhood' : 'listing';

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-busy={pending}
        aria-label={isActive ? `Deactivate ${noun}` : `Activate ${noun}`}
        title={isActive ? 'Click to deactivate' : 'Click to activate'}
        className={cls}
        style={isHero ? { textShadow: '0 1px 2px rgba(0,0,0,0.55)' } : undefined}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotCls}`} />
        {pending ? '…' : isActive ? 'Active' : 'Inactive'}
      </button>

      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="absolute z-[100] w-[300px] rounded-xl border border-line bg-surface p-3 text-xs shadow-lg"
            style={{ top: pos.top, left: pos.left }}
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
    </>
  );
}
