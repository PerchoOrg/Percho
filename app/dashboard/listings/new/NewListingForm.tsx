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
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [autocompleteErr, setAutocompleteErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
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
    if (!resolved) {
      setSubmitErr('Please pick an address from the dropdown.');
      return;
    }

    const payload: CreateListingInput = {
      address: resolved.street_address,
      city: resolved.city,
      state: resolved.state,
      zip: resolved.zip,
      lat: resolved.lat,
      lng: resolved.lng,
      place_id: resolved.place_id,
      price: parseOptInt(price),
      beds: parseOptNum(beds),
      baths: parseOptNum(baths),
      sqft: parseOptInt(sqft),
    };

    startTransition(async () => {
      const result = await createListing(payload);
      // On success, the server action calls redirect() which throws — the
      // promise rejection from the redirect signal is handled by Next, and
      // we never actually receive `{ ok: true }`. Treat any returned object
      // as an error path.
      if (!result.ok) {
        setSubmitErr(result.error);
      }
    });
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label htmlFor="address" className="block text-sm font-medium">
          Address
        </label>

        {resolved ? (
          <div className="flex items-center justify-between rounded border border-bronze/30 bg-ink2 p-3">
            <div className="text-sm">
              <div className="font-medium text-cream">{resolved.formatted_address}</div>
              <div className="mt-1 text-xs text-cream/60">
                {resolved.city}, {resolved.state}
                {resolved.zip ? ` ${resolved.zip}` : ''} · {resolved.lat.toFixed(4)},{' '}
                {resolved.lng.toFixed(4)}
              </div>
            </div>
            <button
              type="button"
              onClick={clearResolved}
              className="text-xs text-cream/60 underline hover:text-cream"
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
              className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
            />
            {predictions.length > 0 && (
              <ul className="rounded border border-bronze/30 bg-ink2">
                {predictions.map((p) => (
                  <li key={p.place_id}>
                    <button
                      type="button"
                      onClick={() => pickPrediction(p)}
                      className="block w-full px-3 py-2 text-left text-sm text-cream hover:bg-bronze/10"
                    >
                      {p.description}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resolving && <p className="text-xs text-cream/60">Resolving address...</p>}
            {autocompleteErr && (
              <p className="text-xs text-red-400">Address lookup failed ({autocompleteErr}).</p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="price" className="block text-sm font-medium">
            Price (USD, optional)
          </label>
          <input
            id="price"
            type="number"
            min="1"
            placeholder="1250000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="sqft" className="block text-sm font-medium">
            Sqft (optional)
          </label>
          <input
            id="sqft"
            type="number"
            min="1"
            placeholder="3200"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="beds" className="block text-sm font-medium">
            Beds (optional)
          </label>
          <input
            id="beds"
            type="number"
            min="0"
            step="0.5"
            placeholder="4"
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="baths" className="block text-sm font-medium">
            Baths (optional)
          </label>
          <input
            id="baths"
            type="number"
            min="0"
            step="0.5"
            placeholder="3"
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
        </div>
      </div>

      {submitErr && <p className="text-sm text-red-400">Error: {submitErr}</p>}

      <button
        type="submit"
        disabled={!resolved || isPending}
        className="rounded bg-gold px-4 py-2 font-medium text-ink disabled:opacity-50"
      >
        {isPending ? 'Creating...' : 'Create draft listing'}
      </button>

      <p className="text-xs text-cream/60">
        Phase 4.1 captures address + optional pricing fields. The next page will let you upload
        videos, set the cover photo, and publish.
      </p>
    </form>
  );
}
