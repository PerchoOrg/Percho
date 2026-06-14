'use client';

/**
 * NewCommunityForm — Phase 4.4 / simplified Phase 25.4 (2026-06-14).
 *
 * The slug used to be user-editable here. Per product direction, agents
 * should never type slugs — they're URL plumbing. Server now derives the
 * slug from the name and handles collisions itself.
 */

import { createCommunity } from '@/app/dashboard/communities/actions';
import { useState, useTransition } from 'react';

const INPUT_CLASS =
  'w-full rounded border border-bronze/30 bg-ink2 px-3 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';

export function NewCommunityForm() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('GA');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCommunity({
        name: name.trim(),
        city: city.trim() === '' ? null : city.trim(),
        state: state.trim().toUpperCase(),
        description: description.trim() === '' ? null : description.trim(),
      });
      // On success, server action redirects — we never get here.
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Buckhead"
          required
          maxLength={120}
          className={INPUT_CLASS}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_5rem]">
        <Field label="City">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Atlanta"
            maxLength={80}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="State">
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            maxLength={2}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Short blurb shown on the public community page."
          maxLength={2000}
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending || name.trim() === ''}
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create community'}
        </button>
        {error && <span className="text-sm text-red-400">Error: {error}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-cream/70">
        {label}
        {required ? <span className="text-gold"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-cream/40">{hint}</span> : null}
    </div>
  );
}
