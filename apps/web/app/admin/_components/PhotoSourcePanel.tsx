'use client';

/**
 * PhotoSourcePanel — paste a page URL, get its photos into the review table.
 *
 * Owner 2026-08-18: "input websites that have good content, then everything
 * will go to photo table for review". Google Places has nothing for an HOA
 * pool or clubhouse, and the pipeline's own discovery can only find listed
 * businesses — so the good imagery for a subdivision has to come from a page a
 * human picked. Every photo arrives `pending`; approving is still a click in
 * the table below.
 */

import { useState } from 'react';

interface IngestResult {
  poi_name: string;
  found: number;
  added: number;
  skipped: Array<{ url: string; reason: string }>;
}

export function PhotoSourcePanel({
  communityId,
  onIngested,
  suggestions = [],
}: {
  communityId: string;
  onIngested: () => void;
  /**
   * URLs the research step already found: the community's own site, and each
   * POI's. They were collected, stored and never used — the only photo ingest
   * was this panel's text box, so Aberdeen's 31 site photos were all pasted by
   * hand while twelve perfectly good county-park and school URLs sat in the
   * run blob (owner 2026-08-20). Listed here rather than fetched automatically:
   * he keeps the call on what gets scraped, and photo licensing is unresolved.
   */
  suggestions?: Array<{ url: string; label: string }>;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(overrideUrl?: string, overrideLabel?: string) {
    const target = (overrideUrl ?? url).trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          ...((overrideLabel ?? label).trim() ? { label: (overrideLabel ?? label).trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<IngestResult> & {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(body as IngestResult);
      if (!overrideUrl) setUrl('');
      onIngested();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    // Collapsed by default (owner 2026-08-20). Ingesting from a URL is
    // occasional — most sessions are review, and this panel sat open between
    // the pipeline strip and the table an admin actually works in. The summary
    // still carries the source count, so there is a reason to open it.
    <details className="rounded-2xl border border-line bg-surface">
      <summary className="cursor-pointer p-4 font-semibold text-ink text-sm">
        Add photos from a website
        {suggestions.length > 0 && (
          <span className="ml-2 font-normal text-ink2 text-xs">
            {suggestions.length} source{suggestions.length === 1 ? '' : 's'} found
          </span>
        )}
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-muted">
          Paste a page from the community&apos;s own site — an amenities page, a photo album. Every
          image on it lands in the photo table below as pending, for you to approve or reject.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="https://example.org/amenities/"
            disabled={busy}
            className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted disabled:text-muted"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="Pool"
            disabled={busy}
            aria-label="What this page shows"
            className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted disabled:text-muted sm:w-40"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !url.trim()}
            className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
          >
            {busy ? 'Fetching…' : 'Fetch photos'}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Leave the second field blank to file them under &ldquo;Amenities&rdquo;, or name what the
          page shows (Pool, Clubhouse, Tennis) to keep sources apart in the tour.
        </p>

        {suggestions.length > 0 && (
          <div className="mt-4 border-line border-t pt-3">
            <div className="font-medium text-ink text-xs">
              Sources the research step found{' '}
              <span className="font-normal text-ink2">({suggestions.length})</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted">
              Fetch pulls every image on the page into the table below as pending — nothing is used
              until you approve it.
            </p>
            <ul className="mt-2 space-y-1">
              {suggestions.map((sg) => (
                <li key={sg.url} className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => void submit(sg.url, sg.label)}
                    disabled={busy}
                    className="shrink-0 rounded-md border border-line bg-bg px-2 py-0.5 text-ink hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
                  >
                    Fetch
                  </button>
                  <span className="shrink-0 font-medium text-ink">{sg.label}</span>
                  <a
                    href={sg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-ink2 underline"
                    title={sg.url}
                  >
                    {sg.url.replace(/^https?:\/\//, '')}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink2">
            <div className="font-semibold text-ink">
              {result.added} photo{result.added === 1 ? '' : 's'} added to {result.poi_name}
            </div>
            <div className="mt-0.5">
              {result.found} image{result.found === 1 ? '' : 's'} on the page
              {result.skipped.length > 0 && `, ${result.skipped.length} skipped`}. Reload to see
              them in the table below.
            </div>
            {result.skipped.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-muted">Why photos were skipped</summary>
                <ul className="mt-1 space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={s.url} className="truncate">
                      <span className="text-muted">{s.reason}</span> — {s.url}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
