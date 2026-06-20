'use client';

/**
 * NewListingForm — Phase 4.1 minimal listing creation.
 *
 * Flow:
 *   1. Agent types in address field.
 *   2. Debounced GET /api/places/autocomplete returns predictions.
 *   3. Agent picks a prediction → GET /api/places/details fills hidden state
 *      (street_address / city / state / zip / lat / lng).
 *   4. Optional price / beds / baths / sqft text fields.
 *   5. Submit → server action createListing → redirect to edit page.
 *
 * The Google session token is generated once per "address-search burst" and
 * sent with both the autocomplete and details calls so Google bills it as
 * one session, not per-keystroke.
 */

import { peekPrefillCount } from '@/app/_components/upload-prefill-store';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { CreateListingInput } from './actions';
import { createListing } from './actions';

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
  // crypto.randomUUID is fine in modern browsers; fall back to a Math.random
  // composite if it's missing (older WebViews, tests).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseOptInt(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseOptNum(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function NewListingForm() {
  const searchParams = useSearchParams();
  const prefillId = searchParams?.get('prefill') ?? null;
  const prefillCount = prefillId ? peekPrefillCount(prefillId) : 0;

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

  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [sqft, setSqft] = useState('');

  // Debounced autocomplete fetch.
  useEffect(() => {
    if (resolved) return; // user already picked one — don't keep searching
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
      // Mint a fresh session token for any subsequent search burst.
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

    const payload: CreateListingInput = {
      address: resolved.street_address,
      city: resolved.city,
      state: resolved.state,
      zip: resolved.zip,
      neighborhood: resolved.neighborhood,
      lat: resolved.lat,
      lng: resolved.lng,
      place_id: resolved.place_id,
      price: parseOptInt(price),
      beds: parseOptNum(beds),
      baths: parseOptNum(baths),
      sqft: parseOptInt(sqft),
      prefillId: prefillId,
    };

    startTransition(async () => {
      const result = await createListing(payload);
      // On success, the server action calls redirect() which throws — the
      // promise rejection from the redirect signal is handled by Next, and
      // we never actually receive `{ ok: true }`. Treat any returned object
      // as an error path.
      if (!result.ok) {
        setSubmitErr(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {prefillCount > 0 && (
        <div className="rounded border border-line bg-surface p-3 text-xs text-ink2">
          {prefillCount} file{prefillCount === 1 ? '' : 's'} queued — they'll attach to this listing
          after you create the draft.
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="address" className="block text-sm font-medium">
          Address
        </label>

        {resolved ? (
          <div className="flex items-center justify-between rounded border border-line bg-surface p-3">
            <div className="text-sm">
              <div className="font-medium text-ink">{resolved.formatted_address}</div>
              <div className="mt-1 text-xs text-ink2">
                {resolved.city}, {resolved.state}
                {resolved.zip ? ` ${resolved.zip}` : ''}
                {resolved.neighborhood ? ` · ${resolved.neighborhood}` : ''} ·{' '}
                {resolved.lat.toFixed(4)}, {resolved.lng.toFixed(4)}
              </div>
            </div>
            <button
              type="button"
              onClick={clearResolved}
              className="text-xs text-ink2 underline hover:text-ink"
            >
              change
            </button>
          </div>
        ) : (
          <>
            <input
              id="address"
              type="text"
              autoComplete="off"
              placeholder="Start typing an address..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
            />
            {predictions.length > 0 && (
              <ul className="rounded border border-line bg-surface">
                {predictions.map((p) => (
                  <li key={p.place_id}>
                    <button
                      type="button"
                      onClick={() => pickPrediction(p)}
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-ink2/10"
                    >
                      {p.description}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resolving && <p className="text-xs text-ink2">Resolving address...</p>}
            {autocompleteErr && (
              <p className="text-xs text-red-400">Address lookup failed ({autocompleteErr}).</p>
            )}
          </>
        )}
      </div>

      <p className="rounded border border-line bg-surface p-3 text-xs text-ink2">
        Address is required to create a draft. Price, beds, baths, and at least one ready video are
        required to publish — you can fill those here or on the next screen.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="price" className="flex items-center gap-2 text-sm font-medium">
            <span>List price (USD)</span>
            <OptionalBadge />
          </label>
          <input
            id="price"
            type="number"
            min="1"
            placeholder="e.g. 1250000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="sqft" className="flex items-center gap-2 text-sm font-medium">
            <span>Square feet</span>
            <OptionalBadge />
          </label>
          <input
            id="sqft"
            type="number"
            min="1"
            placeholder="e.g. 3200"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted focus:border-line-strong focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="beds" className="flex items-center gap-2 text-sm font-medium">
            <span>Bedrooms</span>
            <OptionalBadge />
          </label>
          <select
            id="beds"
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="w-full rounded border border-line bg-bg px-3 py-2 text-ink focus:border-line-strong focus:outline-none"
          >
            <option value="">— Select —</option>
            <option value="0">0 (studio)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7+</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="baths" className="flex items-center gap-2 text-sm font-medium">
            <span>Bathrooms</span>
            <OptionalBadge />
          </label>
          <select
            id="baths"
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            className="w-full rounded border border-line bg-bg px-3 py-2 text-ink focus:border-line-strong focus:outline-none"
          >
            <option value="">— Select —</option>
            <option value="1">1</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
            <option value="3">3</option>
            <option value="3.5">3.5</option>
            <option value="4">4</option>
            <option value="4.5">4.5</option>
            <option value="5">5+</option>
          </select>
        </div>
      </div>

      {submitErr && (
        <div className="space-y-1 text-sm text-red-400">
          {Object.keys(fieldErrors).length > 0 ? (
            <>
              <p>Could not create draft — please fix:</p>
              <ul className="ml-4 list-disc text-xs">
                {Object.entries(fieldErrors).map(([field, msgs]) => (
                  <li key={field}>
                    <span className="font-medium">{field}</span>: {msgs.join(', ')}
                    {field === 'city' && resolved && !resolved.city && (
                      <>
                        {' '}
                        — Google didn't return a city for this address (rural / unincorporated). Try
                        a more specific street address, or pick a nearby address with a city.
                      </>
                    )}
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
        {isPending ? 'Creating...' : 'Create draft listing'}
      </button>

      <p className="text-xs text-ink2">
        After creating the draft you'll upload videos, fine-tune details, and publish.
      </p>
    </form>
  );
}

function OptionalBadge() {
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
      Optional
    </span>
  );
}
