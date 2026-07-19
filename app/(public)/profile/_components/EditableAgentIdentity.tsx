'use client';

/**
 * Inline-editable agent identity card.
 *
 * Agent can change `name` and `brokerage` from the profile page. Slug stays
 * frozen — system-generated at signup from email local-part, never re-synced
 * on rename. Re-syncing would break already-shared `/a/<slug>` links.
 *
 * Email is read-only here; password change goes through Supabase Auth's
 * forgot-password flow (see Account settings card on the page).
 *
 * Pattern: click the field → inline <input> → save on Enter or blur, cancel
 * on Escape. Optimistic local state, server action persists. No /profile/edit
 * sub-route — we want a one-tap mobile UX.
 */

import { useState, useTransition } from 'react';
import { updateAgentIdentity } from '../actions';
import { AvatarPicker } from './AvatarPicker';

type Field = 'name' | 'brokerage';

export function EditableAgentIdentity({
  initialName,
  initialBrokerage,
  email,
  userId,
  initialAvatarUrl,
}: {
  initialName: string;
  initialBrokerage: string | null;
  email: string;
  userId: string;
  initialAvatarUrl: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [brokerage, setBrokerage] = useState(initialBrokerage ?? '');
  const [editing, setEditing] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(field: Field, next: string) {
    const trimmed = next.trim();
    const prev = field === 'name' ? initialName : (initialBrokerage ?? '');

    // No-op if unchanged.
    if (trimmed === prev) {
      setEditing(null);
      return;
    }

    // Name can't be empty; brokerage can.
    if (field === 'name' && trimmed === '') {
      setError('Name cannot be empty.');
      if (field === 'name') setName(initialName);
      setEditing(null);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateAgentIdentity({
        name: field === 'name' ? trimmed : name,
        brokerage: field === 'brokerage' ? trimmed : brokerage,
      });
      if (result.error) {
        setError(result.error);
        // Revert optimistic value.
        if (field === 'name') setName(initialName);
        else setBrokerage(initialBrokerage ?? '');
      }
      setEditing(null);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div>
        <AvatarPicker
          initialUrl={initialAvatarUrl}
          userId={userId}
          fallbackLetter={(initialName || email || '?').charAt(0)}
        />
      </div>

      {/* Name */}
      <div className="mt-2">
        {editing === 'name' ? (
          <input
            autoFocus
            type="text"
            defaultValue={name}
            disabled={isPending}
            onBlur={(e) => save('name', e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save('name', e.currentTarget.value);
              } else if (e.key === 'Escape') {
                setEditing(null);
              }
            }}
            className="w-full rounded border border-line bg-bg px-2 py-1 font-serif text-2xl text-ink focus:border-line-strong focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('name')}
            className="-mx-1 w-full rounded px-1 py-0.5 text-left font-serif text-2xl text-ink hover:bg-surface/5"
            title="Tap to edit"
          >
            {name}
            <span className="ml-2 align-middle text-muted text-xs">✎</span>
          </button>
        )}
      </div>

      {/* Brokerage */}
      <div className="mt-1">
        {editing === 'brokerage' ? (
          <input
            autoFocus
            type="text"
            defaultValue={brokerage}
            disabled={isPending}
            placeholder="Brokerage (optional)"
            onBlur={(e) => save('brokerage', e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save('brokerage', e.currentTarget.value);
              } else if (e.key === 'Escape') {
                setEditing(null);
              }
            }}
            className="w-full rounded border border-line bg-bg px-2 py-1 text-ink text-sm focus:border-line-strong focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('brokerage')}
            className="-mx-1 w-full rounded px-1 py-0.5 text-left text-ink2 text-sm hover:bg-surface/5"
            title="Tap to edit"
          >
            {brokerage || <span className="text-muted">Add brokerage</span>}
            <span className="ml-2 align-middle text-muted text-xs">✎</span>
          </button>
        )}
      </div>

      <div className="mt-3 text-ink2 text-xs">{email}</div>

      {error ? <div className="mt-2 text-rose-300/80 text-xs">{error}</div> : null}
    </div>
  );
}
