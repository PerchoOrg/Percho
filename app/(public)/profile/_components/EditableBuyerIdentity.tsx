'use client';

/**
 * Phase 25.3 (2026-06-14): Inline-editable buyer identity card.
 *
 * Buyers can rename `display_name` from /profile. Email is read-only
 * (Supabase Auth flows). Mirrors EditableAgentIdentity but simpler — only
 * one editable field and no public-page revalidation (buyers have no
 * public page in V1).
 */

import { useState, useTransition } from 'react';
import { updateBuyerDisplayName } from '../actions';
import { AvatarPicker } from './AvatarPicker';

export function EditableBuyerIdentity({
  initialDisplayName,
  email,
  userId,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  email: string;
  userId: string;
  initialAvatarUrl: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: string) {
    const trimmed = next.trim();
    if (trimmed === displayName) {
      setEditing(false);
      return;
    }
    if (trimmed === '') {
      setError('Display name cannot be empty.');
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBuyerDisplayName({ displayName: trimmed });
      if (result.error) {
        setError(result.error);
      } else {
        setDisplayName(trimmed);
      }
      setEditing(false);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div>
        <AvatarPicker
          initialUrl={initialAvatarUrl}
          userId={userId}
          fallbackLetter={(initialDisplayName || email || '?').charAt(0)}
        />
      </div>

      <div className="mt-2">
        {editing ? (
          <input
            autoFocus
            type="text"
            defaultValue={displayName}
            disabled={isPending}
            onBlur={(e) => save(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save(e.currentTarget.value);
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
            className="w-full rounded border border-line bg-bg px-2 py-1 font-serif text-2xl text-ink focus:border-line-strong focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-mx-1 w-full rounded px-1 py-0.5 text-left font-serif text-2xl text-ink hover:bg-surface/5"
            title="Tap to edit"
          >
            {displayName}
            <span className="ml-2 align-middle text-muted text-xs">✎</span>
          </button>
        )}
      </div>

      <div className="mt-3 text-ink2 text-xs">{email}</div>

      {error ? <div className="mt-2 text-rose-300/80 text-xs">{error}</div> : null}
    </div>
  );
}
