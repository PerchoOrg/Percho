'use client';

import { useMemo, useState } from 'react';
import { MOCK_LISTINGS, type MockListing } from '@/lib/mls/mock-data';

/**
 * AutofillDemo — client search box + animated preview card.
 *
 * Reads directly from the mock array for zero-latency dropdown filtering.
 * The `/api/demo/autofill?q=` endpoint is available for a "here's the REST
 * shape" story but this component doesn't need to hit it.
 */
export function AutofillDemo() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MockListing | null>(null);
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_LISTINGS;
    return MOCK_LISTINGS.filter((l) => {
      const hay = `${l.address} ${l.city} ${l.zip}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const showDropdown = focused && suggestions.length > 0 && !selected;

  function pick(listing: MockListing) {
    setSelected(listing);
    setQuery(`${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`);
    setFocused(false);
  }

  function reset() {
    setSelected(null);
    setQuery('');
  }

  return (
    <div className="w-full">
      {/* Search box */}
      <div className="relative">
        <label htmlFor="autofill-input" className="sr-only">
          Property address
        </label>
        <input
          id="autofill-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) setSelected(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Start typing an Atlanta address…"
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
        />

        {showDropdown && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-white shadow-lg"
          >
            {suggestions.map((l) => (
              <li key={l.mls_number}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(l)}
                  className="flex w-full items-start justify-between gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-bg2"
                >
                  <div>
                    <div className="text-sm font-medium text-ink">{l.address}</div>
                    <div className="text-xs text-muted">
                      {l.city}, {l.state} {l.zip}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted">MLS #{l.mls_number}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview card */}
      {selected && (
        <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm duration-500">
          {/* Hero photo */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-bg2">
            {/* biome-ignore lint/performance/noImgElement: external hotlink, not next/image */}
            <img
              src={selected.photo_urls[0]}
              alt={selected.address}
              className="h-full w-full object-cover"
            />
            <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-ink shadow-sm">
              MLS #{selected.mls_number} · {selected.days_on_market} DOM
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl text-ink sm:text-3xl">
                  {formatPrice(selected.price)}
                </h2>
                <p className="mt-1 text-sm text-ink2">
                  {selected.address}, {selected.city}, {selected.state} {selected.zip}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-xs text-muted underline hover:text-ink"
              >
                Reset
              </button>
            </div>

            {/* Stat row */}
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Beds" value={String(selected.beds)} />
              <Stat label="Baths" value={String(selected.baths)} />
              <Stat label="Sqft" value={selected.sqft.toLocaleString()} />
              <Stat
                label="Lot"
                value={selected.lot_size > 0 ? `${selected.lot_size} ac` : '—'}
              />
              <Stat label="Year" value={String(selected.year_built)} />
            </dl>

            <p className="mt-5 text-sm text-ink2 sm:text-base">{selected.description}</p>

            {/* Photo grid */}
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {selected.photo_urls.slice(1, 7).map((url, i) => (
                <div
                  key={url}
                  className="aspect-square overflow-hidden rounded-md bg-bg2"
                >
                  {/* biome-ignore lint/performance/noImgElement: external hotlink */}
                  <img
                    src={url}
                    alt={`${selected.address} photo ${i + 2}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs text-muted">
              Auto-filled from FMLS. Agent adds one video and hits publish.
            </p>
          </div>
        </div>
      )}

      {!selected && (
        <p className="mt-4 text-xs text-muted">
          Try: <button type="button" onClick={() => setQuery('Peachtree')} className="underline">Peachtree</button>{' '}
          ·{' '}
          <button type="button" onClick={() => setQuery('Sandy Springs')} className="underline">Sandy Springs</button>{' '}
          ·{' '}
          <button type="button" onClick={() => setQuery('Ashby')} className="underline">Ashby</button>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg2/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-eyebrow text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-ink">{value}</dd>
    </div>
  );
}

function formatPrice(cents: number): string {
  return `$${cents.toLocaleString('en-US')}`;
}
