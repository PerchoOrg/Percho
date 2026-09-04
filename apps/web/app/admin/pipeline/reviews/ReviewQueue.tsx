'use client';

/**
 * The review queue's rows and verdict buttons. Each verdict POSTs to
 * `/api/admin/reviews` and refreshes the server page, which re-sorts pending
 * rows to the top.
 */

import { REVIEW_DIMENSION_LABELS, cleanDimensions } from '@/lib/communities/reviews';
import { Check, Loader2, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ReviewQueueRow = {
  id: string;
  rating: number;
  dimensions: Record<string, unknown>;
  body: string;
  status: string;
  updatedAt: string;
  reviewedAt: string | null;
  community: { name: string; city: string; slug: string } | null;
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-surface text-ink2 border-line',
};

const BTN =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs transition disabled:opacity-60';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ReviewQueue({ rows }: { rows: ReviewQueueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = rows.filter((r) => r.status === 'pending').length;

  async function verdict(id: string, status: 'approved' | 'rejected' | 'pending') {
    setError(null);
    setBusy(id);
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'update failed');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-line border-b bg-surface/60 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-base text-ink">Resident reviews</h2>
          <p className="text-ink2 text-xs">
            Nothing shows in the app until it is approved here. Reviews are anonymous to buyers.
          </p>
        </div>
        <div className="text-ink2 text-xs">
          <span className="font-medium text-ink">{rows.length}</span> total
          {pending > 0 && (
            <>
              {' '}
              · <span className="font-medium text-amber-700">{pending} to review</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="border-red-200 border-b bg-red-50 px-4 py-2 text-red-700 text-xs">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-ink2 text-sm">No reviews yet.</div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const dims = cleanDimensions(r.dimensions);
            const isBusy = busy === r.id;
            return (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:px-5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_CLASS[r.status] ?? STATUS_CLASS.rejected}`}
                    >
                      {r.status}
                    </span>
                    {r.community ? (
                      <Link
                        href={`/c/${r.community.slug}`}
                        className="font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {r.community.name}
                        {r.community.city ? `, ${r.community.city}` : ''}
                      </Link>
                    ) : (
                      <span className="text-ink2">(community deleted)</span>
                    )}
                    <span className="text-ink2">· {fmtDate(r.updatedAt)}</span>
                  </div>
                  <div className="text-ink text-sm">
                    <span className="font-semibold">{r.rating}/5</span>
                    {Object.entries(dims).length > 0 && (
                      <span className="ml-2 text-ink2 text-xs">
                        {Object.entries(dims)
                          .map(
                            ([k, v]) =>
                              `${REVIEW_DIMENSION_LABELS[k as keyof typeof REVIEW_DIMENSION_LABELS]} ${v}`,
                          )
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-ink text-sm leading-relaxed">{r.body}</p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  {r.status !== 'approved' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => verdict(r.id, 'approved')}
                      className={`${BTN} border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400`}
                    >
                      {isBusy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Approve
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => verdict(r.id, 'rejected')}
                      className={`${BTN} border-red-200 bg-red-50 text-red-700 hover:border-red-400`}
                    >
                      <X size={12} />
                      Reject
                    </button>
                  )}
                  {r.status !== 'pending' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => verdict(r.id, 'pending')}
                      className={`${BTN} border-line bg-bg text-ink hover:border-ink2`}
                    >
                      <RotateCcw size={12} />
                      Re-queue
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
