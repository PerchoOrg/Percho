'use client';

/**
 * DangerZone — full-width destructive action block at the bottom of the
 * listing edit page (Phase 47.12). Replaces the hero ⋯/Delete affordance.
 *
 * Convention: dangerous, irreversible actions live below the fold of the
 * normal form work. The user has to scroll past everything to reach it,
 * and a `confirm()` still gates the actual call.
 */

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { deleteListingAndRedirect } from './archive-actions';

export function DangerZone({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        router.refresh();
      } catch (e) {
        if (e && typeof e === 'object' && 'digest' in e) throw e;
        alert(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  }

  return (
    <section>
      <div className="rounded-2xl border border-rose-400 bg-rose-50 p-5 sm:p-6">
        <h2 className="font-semibold text-ink text-sm">Danger zone</h2>
        <p className="mt-1 text-ink2 text-xs">
          Permanently delete this listing. Videos, photos, leads and analytics
          will be removed. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-medium text-sm text-white transition hover:bg-rose-700 active:scale-[0.99] disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
        >
          {pending ? 'Deleting…' : 'Delete this listing'}
        </button>
      </div>
    </section>
  );
}
