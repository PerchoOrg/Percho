'use client';

/**
 * EnhancePanel — original vs enhanced review for a set of photos.
 *
 * ONE component for both `listing_photos` (Home Tour page) and `poi_photos`
 * (POI page): the two tables carry the identical `enhanced_*` column set, so a
 * per-page copy would be duplicated markup with a different table string.
 *
 * Layout is a drag-to-compare slider rather than side-by-side thumbnails —
 * enhancement differences (grain, micro-contrast) are invisible at thumbnail
 * size, and the whole point of the page is deciding whether the difference is
 * good. Approve/Reject sits under the slider; approving is what makes the next
 * render actually use the enhanced file.
 */

import {
  type EnhanceDecision,
  type PhotoTable,
  queuePhotoEnhancement,
  setEnhancedDecision,
} from '@/lib/poi/admin-enhance-actions';
import { Check, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type EnhancePhoto = {
  id: string;
  storage_path: string;
  enhanced_path: string | null;
  enhanced_status: string;
  enhanced_preset: string | null;
  enhanced_error: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'text-emerald-600',
  ready: 'text-amber-600',
  rejected: 'text-red-600',
  failed: 'text-red-600',
  queued: 'text-blue-600',
  processing: 'text-blue-600',
  none: 'text-ink2',
};

export function EnhancePanel({
  table,
  storageBase,
  bucket,
  photos,
}: {
  table: PhotoTable;
  storageBase: string;
  bucket: string;
  photos: EnhancePhoto[];
}) {
  const router = useRouter();
  // Plain useState, not useTransition: the installed React types don't accept an
  // async TransitionFunction (see the same error in other files on this repo).
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const url = (p: string) => `${storageBase}/storage/v1/object/public/${bucket}/${p}`;

  const counts = photos.reduce<Record<string, number>>((acc, p) => {
    acc[p.enhanced_status] = (acc[p.enhanced_status] ?? 0) + 1;
    return acc;
  }, {});

  const needsEnhance = photos.filter(
    (p) => p.enhanced_status === 'none' || p.enhanced_status === 'failed',
  );
  const awaiting = photos.filter((p) => p.enhanced_status === 'ready');

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.message ?? 'Failed');
      } finally {
        setPending(false);
        router.refresh();
      }
    })();
  }

  if (photos.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Enhancement{' '}
          <span className="text-ink2 text-sm font-normal">
            {Object.entries(counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(' · ')}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || needsEnhance.length === 0}
            onClick={() =>
              run(() =>
                queuePhotoEnhancement(
                  table,
                  needsEnhance.map((p) => p.id),
                ),
              )
            }
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:border-ink2 disabled:opacity-40"
          >
            <Sparkles size={15} />
            Enhance {needsEnhance.length || ''} unprocessed
          </button>
          <button
            type="button"
            disabled={pending || photos.length === 0}
            onClick={() =>
              run(() =>
                queuePhotoEnhancement(
                  table,
                  photos.map((p) => p.id),
                ),
              )
            }
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink2 hover:border-ink2 disabled:opacity-40"
          >
            Re-enhance all
          </button>
        </div>
      </div>

      <p className="text-ink2 text-xs">
        Chain: super-resolution → denoise → sharpen → local contrast → colour correction.
        <strong className="text-ink"> Approving</strong> a photo is what makes the next render use
        the enhanced file — <em>ready</em> alone changes nothing.
        {awaiting.length > 0 && ` ${awaiting.length} awaiting your review.`}
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p) => {
          const isOpen = openId === p.id;
          return (
            <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : p.id)}
                className="block w-full"
                aria-label="Compare original and enhanced"
              >
                <div className="relative aspect-square w-full bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url(p.enhanced_path && isOpen ? p.enhanced_path : p.storage_path)}
                    alt="photo"
                    className="h-full w-full object-cover"
                  />
                  {p.enhanced_path && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {isOpen ? 'ENHANCED' : 'ORIGINAL — tap to compare'}
                    </span>
                  )}
                </div>
              </button>
              <div className="space-y-2 p-2 text-xs">
                <div className={STATUS_COLOR[p.enhanced_status] ?? 'text-ink2'}>
                  {p.enhanced_status}
                  {p.enhanced_preset ? ` · ${p.enhanced_preset}` : ''}
                </div>
                {p.enhanced_error && (
                  <div className="text-red-600" title={p.enhanced_error}>
                    {p.enhanced_error.slice(0, 80)}
                  </div>
                )}
                {p.enhanced_path && p.enhanced_status !== 'queued' && (
                  <div className="flex gap-2">
                    <Decide
                      label="Reject"
                      icon={<X size={13} />}
                      active={p.enhanced_status === 'rejected'}
                      disabled={pending}
                      onClick={() => run(() => setEnhancedDecision(table, p.id, 'rejected'))}
                    />
                    <Decide
                      label="Approve"
                      icon={<Check size={13} />}
                      active={p.enhanced_status === 'approved'}
                      disabled={pending}
                      onClick={() => run(() => setEnhancedDecision(table, p.id, 'approved'))}
                      primary
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Decide({
  label,
  icon,
  active,
  disabled,
  onClick,
  primary,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  const base =
    'flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 font-medium disabled:opacity-40';
  const cls = active
    ? primary
      ? 'bg-emerald-500 text-white'
      : 'bg-red-500 text-white'
    : 'border border-line bg-bg text-ink2 hover:border-ink2';
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${cls}`}>
      {icon}
      {label}
    </button>
  );
}

export type { EnhanceDecision };
