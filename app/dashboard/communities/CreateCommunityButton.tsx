'use client';

/**
 * CreateCommunityButton — empty-state CTA.
 *
 * Phase 50.17 (2026-06-23): replaces the `<Link href="/communities/new">`
 * with a client button that calls the createStubCommunity server action
 * and pushes to the new hub. Mirrors the FAB flow in UploadSheet so the
 * agent has exactly one entry point pattern across the app.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createStubCommunity } from './actions';

export function CreateCommunityButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createStubCommunity();
      if (!result.ok) {
        setError('Could not create — please retry.');
        return;
      }
      router.push(`/dashboard/communities/${result.data.id}`);
    });
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="underline hover:text-ink disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create one'}
      </button>
      {error ? <span className="text-[11px] text-rose-600">{error}</span> : null}
    </span>
  );
}
