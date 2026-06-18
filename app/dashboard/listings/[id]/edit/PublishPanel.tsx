'use client';

/**
 * Phase 4.6 — publish / unpublish UI panel.
 * Phase 8/listing-form-ux (2026-06-11) — translate raw missing[] keys returned
 * by publishListing into human-readable labels with concrete fix hints. Old UX
 * showed e.g. "beds" / "at least one ready video" verbatim, which read as
 * cryptic when an agent had filled placeholders that looked like real values.
 *
 * Public URL is shown when published so the agent can copy/share immediately.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { archiveListing, unarchiveListing } from './archive-actions';
import { flushPending } from './flush-registry';
import { publishListing, unpublishListing } from './publish-actions';

interface Props {
  listingId: string;
  status: string;
}

/**
 * Translate raw publish-gate keys into agent-facing labels + fix hints.
 * Keep keys in sync with publish-actions.ts `missing.push(...)` calls.
 */
const MISSING_LABELS: Record<string, { label: string; hint: string }> = {
  address: {
    label: 'Property address',
    hint: 'Address is set when the listing is created and cannot be edited here.',
  },
  price: {
    label: 'List price',
    hint: 'Enter a list price greater than $0.',
  },
  beds: {
    label: 'Bedrooms',
    hint: 'Pick a value (0 = studio).',
  },
  baths: {
    label: 'Bathrooms',
    hint: 'Pick a value greater than 0.',
  },
  'at least one ready video or photo': {
    label: 'A ready video or photo',
    hint: 'Upload a video or photo above and wait for status to show "Ready" before publishing.',
  },
  'at least one ready video': {
    label: 'At least one ready video',
    hint: 'Upload a video above and wait for its status to show "Ready" before publishing.',
  },
};

function describeMissing(key: string): { label: string; hint: string } {
  const hit = MISSING_LABELS[key];
  if (hit) return hit;
  // Fallback: show the raw key so unknown gates aren't silently swallowed.
  return { label: key, hint: '' };
}

export function PublishPanel({ listingId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isPublished = status === 'published';
  const isArchived = status === 'archived';

  function handlePublish() {
    setMissing(null);
    setErr(null);
    startTransition(async () => {
      // Flush any pending auto-save in EditListingForm before publishing,
      // otherwise the publish gate sees stale DB values.
      try {
        await flushPending();
      } catch {
        // If the flush itself errored, the form's SaveBadge already shows it.
        // Don't block publish — let the gate report the real missing fields.
      }
      const res = await publishListing(listingId);
      if (res.ok) {
        router.refresh();
      } else {
        setMissing(res.missing);
      }
    });
  }

  function handleUnpublish() {
    setMissing(null);
    setErr(null);
    startTransition(async () => {
      const res = await unpublishListing(listingId);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function handleArchive() {
    if (!confirm('Archive this listing? It will be hidden from the dashboard and 404 publicly.'))
      return;
    setMissing(null);
    setErr(null);
    startTransition(async () => {
      const res = await archiveListing(listingId);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function handleUnarchive() {
    setMissing(null);
    setErr(null);
    startTransition(async () => {
      const res = await unarchiveListing(listingId);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="rounded border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-ink2">Status: </span>
          <span
            className={`font-semibold uppercase tracking-wide ${
              isPublished ? 'text-ink' : isArchived ? 'text-muted' : 'text-ink2'
            }`}
          >
            {status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isArchived ? (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={isPending}
              className="rounded border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-ink2/20 disabled:opacity-50"
            >
              {isPending ? 'Unarchiving…' : 'Unarchive'}
            </button>
          ) : (
            <>
              {isPublished ? (
                <button
                  type="button"
                  onClick={handleUnpublish}
                  disabled={isPending}
                  className="rounded border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-ink2/20 disabled:opacity-50"
                >
                  {isPending ? 'Unpublishing…' : 'Unpublish'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPending}
                  className="rounded bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-ink/90 disabled:opacity-50"
                >
                  {isPending ? 'Publishing…' : 'Publish'}
                </button>
              )}
              <button
                type="button"
                onClick={handleArchive}
                disabled={isPending}
                className="rounded border border-line px-3 py-2 text-xs text-ink2 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </div>
      {isArchived && (
        <p className="mt-2 text-xs text-ink2">
          Hidden from the public site and the dashboard's default view. Unarchive returns it to
          draft.
        </p>
      )}
      {missing && missing.length > 0 && (
        <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <p className="font-medium text-red-300">
            Can't publish yet — please fix the following and try again:
          </p>
          <ul className="mt-2 space-y-2 pl-1 text-red-200/90">
            {missing.map((m) => {
              const { label, hint } = describeMissing(m);
              return (
                <li key={m} className="flex gap-2">
                  <span aria-hidden="true" className="text-red-300">
                    •
                  </span>
                  <span>
                    <span className="font-medium">{label}</span>
                    {hint ? <span className="ml-1 text-red-200/70">— {hint}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {err && (
        <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          Error: {err}
        </p>
      )}
    </div>
  );
}
