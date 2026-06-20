'use client';

/**
 * NewCommunityForm — Phase 4.4 / simplified Phase 25.4 (2026-06-14).
 *
 * The slug used to be user-editable here. Per product direction, agents
 * should never type slugs — they're URL plumbing. Server now derives the
 * slug from the name and handles collisions itself.
 *
 * 2026-06-14: errors now render inline under the offending input and the
 * input border turns red, so agents can see *which* field is wrong instead
 * of getting an opaque `invalid_input` next to the submit button.
 */

import { createCommunity } from '@/app/dashboard/communities/actions';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { peekPrefillCount } from '@/app/_components/upload-prefill-store';

const INPUT_BASE =
  'w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1';
const INPUT_OK = 'border-line focus:border-line-strong focus:ring-line-strong';
const INPUT_ERR = 'border-red-500/70 focus:border-red-400 focus:ring-red-400';

function inputCls(hasError: boolean) {
  return `${INPUT_BASE} ${hasError ? INPUT_ERR : INPUT_OK}`;
}

export function NewCommunityForm() {
  const searchParams = useSearchParams();
  const prefillId = searchParams?.get('prefill') ?? null;
  const prefillCount = prefillId ? peekPrefillCount(prefillId) : 0;
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('GA');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await createCommunity(
        {
          name: name.trim(),
          city: city.trim() === '' ? null : city.trim(),
          state: state.trim().toUpperCase(),
          description: description.trim() === '' ? null : description.trim(),
        },
        { prefillId },
      );
      // On success, server action redirects — we never get here.
      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        // Only show the top-level error if it's NOT a per-field validation
        // failure — those already render under the inputs.
        if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
          setFormError(result.error);
        }
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {prefillCount > 0 && (
        <div className="rounded border border-line bg-surface p-3 text-xs text-ink2">
          {prefillCount} file{prefillCount === 1 ? '' : 's'} queued — they'll attach to this
          community after you create it.
        </div>
      )}
      <Field label="Name" required error={fieldErrors.name} hint="2–120 characters">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
          placeholder="Buckhead"
          maxLength={120}
          aria-invalid={!!fieldErrors.name}
          className={inputCls(!!fieldErrors.name)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_5rem]">
        <Field label="City" error={fieldErrors.city}>
          <input
            type="text"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              clearFieldError('city');
            }}
            placeholder="Atlanta"
            maxLength={80}
            aria-invalid={!!fieldErrors.city}
            className={inputCls(!!fieldErrors.city)}
          />
        </Field>
        <Field label="State" error={fieldErrors.state}>
          <input
            type="text"
            value={state}
            onChange={(e) => {
              setState(e.target.value.toUpperCase());
              clearFieldError('state');
            }}
            maxLength={2}
            aria-invalid={!!fieldErrors.state}
            className={inputCls(!!fieldErrors.state)}
          />
        </Field>
      </div>
      <Field label="Description" error={fieldErrors.description}>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearFieldError('description');
          }}
          rows={4}
          placeholder="Short blurb shown on the public community page."
          maxLength={2000}
          aria-invalid={!!fieldErrors.description}
          className={`${inputCls(!!fieldErrors.description)} resize-y`}
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending || name.trim() === ''}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create community'}
        </button>
        {formError && <span className="text-sm text-red-400">Error: {formError}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">
        {label}
        {required ? <span className="text-ink"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}
