'use client';

/**
 * DraftAddressPanel —  *
 * Renders on the listing edit page when the listing is still a fresh
 * stub (`address` column equals the `__draft__-<rand>` placeholder
 * written by `createStubListing`). The agent picks an address from
 * Google Place Details; on save we hit `updateListingAddress`, the
 * server re-derives the slug, and the page reloads into the normal
 * EditListingForm view (which has every other field).
 *
 * Why this is a separate panel and not a section inside EditListingForm:
 * once an address is committed, re-editing it would invalidate the slug
 * and break shared `/v/<agent>/<slug>` links, so address editing is
 * intentionally a one-shot lifecycle stage. Keeping it isolated avoids
 * weaving an `address` field into the existing 11-field auto-save form.
 *
 * The Place Details flow mirrors the deleted NewListingForm: a debounced
 * `/api/places/autocomplete` fetch returns predictions, picking one
 * resolves via `/api/places/details`, then submit calls the server
 * action. The session token is generated once per address-search burst
 * so Google bills it as one billable session.
 */

import { updateListingAddress } from '@/app/dashboard/listings/[id]/edit/actions';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

type Prediction = { place_id: string; description: string };

type Resolved = {
  street_address: string;
  formatted_address: string;
  city: string;
  state: string;
  zip: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  place_id: string;
};

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DraftAddressPanel({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [autocompleteErr, setAutocompleteErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const sessionRef = useRef<string>(newSessionToken());
  const queryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (resolved) return;
    const q = query.trim();
    if (q.length < 3) {
      setPredictions([]);
      return;
    }
    const handle = setTimeout(async () => {
      queryAbortRef.current?.abort();
      const ac = new AbortController();
      queryAbortRef.current = ac;
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(q)}&session=${encodeURIComponent(sessionRef.current)}`,
          { signal: ac.signal },
        );
        if (!res.ok) {
          setAutocompleteErr('address_lookup_failed');
          setPredictions([]);
          return;
        }
        const json = (await res.json()) as { predictions?: Prediction[] };
        setAutocompleteErr(null);
        setPredictions(json.predictions ?? []);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setAutocompleteErr('address_lookup_failed');
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, resolved]);

  async function pickPrediction(p: Prediction) {
    setResolving(true);
    setPredictions([]);
    setQuery(p.description);
    try {
      const res = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(p.place_id)}&session=${encodeURIComponent(sessionRef.current)}`,
      );
      if (!res.ok) {
        setAutocompleteErr('place_details_failed');
        return;
      }
      const json = (await res.json()) as { details?: Resolved };
      if (!json.details) {
        setAutocompleteErr('place_not_found');
        return;
      }
      setResolved(json.details);
      setAutocompleteErr(null);
      sessionRef.current = newSessionToken();
    } finally {
      setResolving(false);
    }
  }

  function clearResolved() {
    setResolved(null);
    setQuery('');
    sessionRef.current = newSessionToken();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    setFieldErrors({});
    if (!resolved) {
      setSubmitErr('Please pick an address from the dropdown.');
      return;
    }
    startTransition(async () => {
      const result = await updateListingAddress(listingId, {
        address: resolved.street_address,
        city: resolved.city,
        state: resolved.state,
        zip: resolved.zip,
        neighborhood: resolved.neighborhood,
        lat: resolved.lat,
        lng: resolved.lng,
      });
      if (!result.ok) {
        setSubmitErr(result.error);
        if ('fieldErrors' in result && result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="space-y-1 pb-4">
        <h2 className="font-serif text-ink text-lg">Set the address</h2>
        <p className="text-ink2 text-sm">
          Pick the property address to finish creating this listing. Photos, videos, price, and the
          rest become available once an address is set.
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label htmlFor="draft-address" className="block font-medium text-sm">
            Address
          </label>

          {resolved ? (
            <div className="flex items-center justify-between rounded border border-line bg-bg p-3">
              <div className="text-sm">
                <div className="font-medium text-ink">{resolved.formatted_address}</div>
                <div className="mt-1 text-ink2 text-xs">
                  {resolved.city}, {resolved.state}
                  {resolved.zip ? ` ${resolved.zip}` : ''}
                  {resolved.neighborhood ? ` · ${resolved.neighborhood}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={clearResolved}
                className="text-ink2 text-xs underline hover:text-ink"
              >
                change
              </button>
            </div>
          ) : (
            <>
              <input
                id="draft-address"
                type="text"
                autoComplete="off"
                placeholder="Start typing an address…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
              />
              {predictions.length > 0 && (
                <ul className="rounded border border-line bg-bg">
                  {predictions.map((p) => (
                    <li key={p.place_id}>
                      <button
                        type="button"
                        onClick={() => pickPrediction(p)}
                        className="block w-full px-3 py-2 text-left text-ink text-sm hover:bg-ink2/10"
                      >
                        {p.description}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {resolving && <p className="text-ink2 text-xs">Resolving address…</p>}
              {autocompleteErr && (
                <p className="text-rose-600 text-xs">Address lookup failed ({autocompleteErr}).</p>
              )}
            </>
          )}
        </div>

        {submitErr && (
          <div className="space-y-1 text-rose-600 text-sm">
            {Object.keys(fieldErrors).length > 0 ? (
              <>
                <p>Could not save address — please fix:</p>
                <ul className="ml-4 list-disc text-xs">
                  {Object.entries(fieldErrors).map(([field, msgs]) => (
                    <li key={field}>
                      <span className="font-medium">{field}</span>: {msgs.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Error: {submitErr}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!resolved || isPending}
          className="rounded bg-ink px-4 py-2 font-medium text-cream disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save address'}
        </button>
      </form>
    </section>
  );
}
