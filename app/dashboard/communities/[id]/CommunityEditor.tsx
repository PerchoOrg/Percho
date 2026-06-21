'use client';

/**
 * CommunityEditor — Phase 4.4; Phase 23 (2026-06-14) trimmed.
 *
 * This used to host three sections (metadata + schools + POIs). Phase 23
 * removed schools/POIs from the UI; only the metadata form lives here now.
 * If we want to bring per-community schools/POIs back later, recover the
 * SchoolsSection / PoisSection from git history.
 *
 * 2026-06-14: validation errors now render inline under the offending input
 * with the input border turning red — same pattern as NewCommunityForm.
 */

import { deleteCommunity, updateCommunity } from '@/app/dashboard/communities/actions';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const INPUT_BASE =
  'w-full rounded border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60';
const INPUT_OK = 'border-line focus:border-line-strong focus:ring-line-strong';
const INPUT_ERR = 'border-red-500/70 focus:border-red-400 focus:ring-red-400';

function inputCls(hasError: boolean) {
  return `${INPUT_BASE} ${hasError ? INPUT_ERR : INPUT_OK}`;
}

interface CommunityRow {
  id: string;
  name: string;
  city: string | null;
  state: string;
  description: string | null;
}

export function CommunityEditor({
  community,
  canEditMetadata,
}: {
  community: CommunityRow;
  canEditMetadata: boolean;
}) {
  return (
    <div className="space-y-6">
      <MetadataSection community={community} canEdit={canEditMetadata} />
      {canEditMetadata && <DangerZone communityId={community.id} />}
    </div>
  );
}

function DangerZone({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    if (
      !confirm(
        'Permanently delete this community? Schools, POIs, photos, videos and saved entries for it will be removed. Listings will be detached but not deleted. This cannot be undone.',
      )
    )
      return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteCommunity(communityId);
      if (res.ok) {
        router.replace('/dashboard/communities');
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <section>
      <div className="rounded-2xl border border-rose-300/60 bg-rose-50/40 p-5 sm:p-6">
        <h2 className="font-semibold text-ink text-sm">Danger zone</h2>
        <p className="mt-1 text-ink2 text-xs">
          Permanently delete this community. Schools, POIs, photos, videos and
          saved entries will be removed. Listings will be detached but not
          deleted. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-medium text-sm text-white transition hover:bg-rose-700 active:scale-[0.99] disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
        >
          {isPending ? 'Deleting…' : 'Delete this community'}
        </button>
        {err && (
          <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-red-600 text-xs">
            Error: {err}
          </p>
        )}
      </div>
    </section>
  );
}

function MetadataSection({
  community,
  canEdit,
}: {
  community: CommunityRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(community.name);
  const [city, setCity] = useState(community.city ?? '');
  const [state, setState] = useState(community.state);
  const [description, setDescription] = useState(community.description ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
    if (!canEdit) return;
    setSaveState('saving');
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await updateCommunity(community.id, {
        name: name.trim(),
        city: city.trim() === '' ? null : city.trim(),
        state: state.trim().toUpperCase(),
        description: description.trim() === '' ? null : description.trim(),
      });
      if (result.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
        router.refresh();
      } else {
        setSaveState('error');
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
          setFormError(result.error);
        }
      }
    });
  }

  return (
    <section className="rounded border border-line bg-surface p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Community details</h2>
        {!canEdit && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink2">
            View only
          </span>
        )}
      </div>
      {!canEdit && (
        <p className="mb-4 rounded border border-line bg-bg px-3 py-2 text-xs text-ink2">
          Only the agent who created this community can edit metadata. You can still upload videos
          and photos.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" required error={fieldErrors.name} hint="2–120 characters">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearFieldError('name');
            }}
            maxLength={120}
            disabled={!canEdit}
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
              maxLength={80}
              disabled={!canEdit}
              aria-invalid={!!fieldErrors.city}
              className={inputCls(!!fieldErrors.city)}
            />
          </Field>
          <Field label="State" required error={fieldErrors.state}>
            <input
              type="text"
              value={state}
              onChange={(e) => {
                setState(e.target.value.toUpperCase());
                clearFieldError('state');
              }}
              maxLength={2}
              disabled={!canEdit}
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
            maxLength={2000}
            disabled={!canEdit}
            aria-invalid={!!fieldErrors.description}
            className={`${inputCls(!!fieldErrors.description)} resize-y`}
          />
        </Field>
        {canEdit && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending || saveState === 'saving'}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
            >
              {saveState === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {saveState === 'saved' && <span className="text-sm text-emerald-400">✓ Saved</span>}
            {saveState === 'error' && formError && (
              <span className="text-sm text-red-400">Error: {formError}</span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">
        {label}
        {required && <span className="ml-0.5 text-ink">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] text-red-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-muted">{hint}</span>
      ) : null}
    </div>
  );
}
