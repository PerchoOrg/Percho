'use client';

/**
 * CreateListingButton — empty-state CTA for /dashboard (My Listing).
 *
 * Phase 57 (2026-06-26): mirrors CreateCommunityButton. Calls
 * createStubListing() and pushes to the new edit page so the empty
 * state has a click target instead of just instructing the agent to
 * find the FAB.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { createStubListing } from '@/app/dashboard/listings/actions';
import { HUB_CTA_CLASS } from '@/app/_components/EmptyHubState';

export function CreateListingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createStubListing();
      if (!result.ok) {
        setError('Could not create — please retry.');
        return;
      }
      router.push(`/dashboard/listings/${result.data.id}/edit`);
    });
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button type="button" onClick={onClick} disabled={pending} className={HUB_CTA_CLASS}>
        <Plus size={16} strokeWidth={2} aria-hidden />
        {pending ? 'Creating…' : 'New listing'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </span>
  );
}
