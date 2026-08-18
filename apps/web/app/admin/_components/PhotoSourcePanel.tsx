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
}: {
  communityId: string;
  onIngested: () => void;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          ...(label.trim() ? { label: label.trim() } : {}),
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
      setUrl('');
      onIngested();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Add photos from a website</h2>
      <p className="mt-1 text-xs text-muted">
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
            {result.skipped.length > 0 && `, ${result.skipped.length} skipped`}. Reload to see them
            in the table below.
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
    </section>
  );
}
