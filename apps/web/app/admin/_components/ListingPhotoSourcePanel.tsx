'use client';

/**
 * ListingPhotoSourcePanel — paste the pages a listing's photos live on.
 *
 * Owner 2026-09-02: "you need to add a manual fetch button (with some web
 * urls) before tag in admin home tour - similar to community tour". The
 * community tour has had this since 2026-08-18; the home tour never did,
 * because a listing's photos were assumed to arrive by upload. A builder's
 * quick move-in breaks that assumption — it has no MLS feed and no photo
 * shoot, only the builder's own page.
 *
 * Two deliberate differences from `PhotoSourcePanel`:
 *
 *   No source list. The community's panel shows a tickable list because its
 *   ingest STEP discovers candidate sites and needs to know which it may read.
 *   A listing has no research step, so there is nothing to tick — pasting a
 *   page is the whole decision, and it is acted on immediately.
 *
 *   Several pages at once. A listing's photos are often split across a
 *   gallery, a floor-plan page and an exterior page, and pasting them one at a
 *   time is three round trips through a collapsed panel. They are fetched
 *   SEQUENTIALLY rather than in parallel: each page is up to 80 downloads and
 *   80 uploads, and firing five of those at one origin is how a site starts
 *   answering 403.
 *
 * Photos land approved, not pending — that is the listing table's rule
 * (migration 20260821100000), and reviewing a home tour means rejecting the
 * few that should not be in the film. The copy below says so, because a page
 * of scraped images is exactly where that default deserves a second look.
 */

import { useState } from 'react';

/** One page's outcome, as the panel shows it. */
interface PageResult {
  url: string;
  found?: number;
  added?: number;
  skipped?: number;
  error?: string;
}

/**
 * The URLs in a textarea, in the order they were written.
 *
 * Split on whitespace rather than on newlines alone: a URL pasted from a
 * browser's address bar sometimes brings a trailing space, and a list copied
 * out of a document can arrive space-separated. Duplicates are dropped — the
 * same page twice in one submit is a paste accident, and fetching it twice
 * would put the second run's "already ingested" skips in front of the admin as
 * if something had gone wrong.
 */
export function parseSourceUrls(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/\s+/)) {
    const url = token.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function ListingPhotoSourcePanel({
  listingId,
  photoCount,
  onIngested,
}: {
  listingId: string;
  photoCount: number;
  onIngested: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<PageResult[]>([]);

  const urls = parseSourceUrls(raw);

  async function submit() {
    if (urls.length === 0 || busy) return;
    setResults([]);
    const collected: PageResult[] = [];
    try {
      for (const url of urls) {
        setBusy(url);
        try {
          const res = await fetch(`/api/admin/listings/${listingId}/ingest-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          const body = (await res.json().catch(() => ({}))) as {
            found?: number;
            added?: number;
            skipped?: Array<unknown>;
            message?: string;
            error?: string;
          };
          collected.push(
            res.ok
              ? {
                  url,
                  found: body.found,
                  added: body.added,
                  skipped: body.skipped?.length ?? 0,
                }
              : { url, error: body.message ?? body.error ?? `HTTP ${res.status}` },
          );
        } catch (err) {
          collected.push({ url, error: err instanceof Error ? err.message : 'Request failed' });
        }
        // Shown as each page lands rather than all at the end: eighty images
        // is a slow minute, and a panel that says nothing for five of them
        // reads as a hung button.
        setResults([...collected]);
      }
      const added = collected.reduce((n, r) => n + (r.added ?? 0), 0);
      if (added > 0) {
        setRaw('');
        onIngested();
      }
    } finally {
      setBusy(null);
    }
  }

  const total = results.reduce((n, r) => n + (r.added ?? 0), 0);

  return (
    // Open when the listing has no photos — that is exactly the session where
    // this panel is the first thing to do, and a collapsed panel above an
    // empty table would read as a pipeline with nothing to feed it.
    <details className="rounded-2xl border border-line bg-surface" open={photoCount === 0}>
      <summary className="cursor-pointer p-4 font-semibold text-ink text-sm">
        Fetch photos from a web page
        <span className="ml-2 font-normal text-ink2 text-xs">
          {photoCount === 0
            ? 'no photos yet — paste the listing’s page below'
            : `${photoCount} photo${photoCount === 1 ? '' : 's'} on this listing`}
        </span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-muted">
          Every photograph on these pages is added to the table below, in page order, before{' '}
          <span className="font-medium text-ink2">Tag</span> runs. Site furniture (logos, icons,
          anything under 400px) is left behind. They arrive{' '}
          <span className="font-medium text-ink2">approved</span>, like every other listing photo —
          reject the ones the film should not use. Re-fetching a page you have already read adds
          nothing.
        </p>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder={
            'https://builder.example.com/homes/the-listing\nhttps://builder.example.com/gallery'
          }
          disabled={busy !== null}
          aria-label="Page URLs, one per line"
          className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-ink text-xs placeholder:text-muted disabled:text-muted"
        />

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy !== null || urls.length === 0}
            className="rounded-lg border border-line bg-bg px-3 py-2 text-ink text-sm hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
          >
            {busy
              ? `Fetching ${results.length + 1} of ${urls.length}…`
              : `Fetch photos${urls.length > 1 ? ` from ${urls.length} pages` : ''}`}
          </button>
          {busy && <span className="truncate text-[11px] text-muted">{busy}</span>}
        </div>

        {results.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-ink2 text-xs">
            <div className="font-semibold text-ink">
              {total} photo{total === 1 ? '' : 's'} added
            </div>
            <ul className="mt-1 space-y-0.5">
              {results.map((r) => (
                <li key={r.url} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate" title={r.url}>
                    {r.url.replace(/^https?:\/\//, '')}
                  </span>
                  <span className={r.error ? 'shrink-0 text-red-700' : 'shrink-0'}>
                    {r.error
                      ? r.error
                      : `${r.added} of ${r.found} kept${r.skipped ? ` · ${r.skipped} skipped` : ''}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
