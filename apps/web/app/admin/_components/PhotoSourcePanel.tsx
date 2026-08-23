'use client';

/**
 * PhotoSourcePanel — which web pages the ingest step is allowed to read.
 *
 * Owner 2026-08-18: "input websites that have good content, then everything
 * will go to photo table for review". Google Places has nothing for an HOA
 * pool or clubhouse, and the pipeline's own discovery can only find listed
 * businesses — so the good imagery for a subdivision has to come from a page a
 * human picked.
 *
 * What changed on 2026-08-23: this panel used to be the ONLY way those photos
 * were ever fetched — a text box, one URL at a time, outside the pipeline
 * entirely. Fetching from websites is now step 2 of the pipeline
 * (`tour-steps/ingest.ts`), and this panel is where its input lives. The
 * owner's rule for that input: "the default main website for the community if
 * it exists, should always be selected as default, and its sibling and child
 * subpages. other webpages are optional unless I manually selected them for
 * fetching."
 *
 * So the list below is three groups, and the tick is the whole point:
 *   community_site  the community's own site and its subpages — ticked
 *   manual          a page pasted into the box — ticked, pasting IS the choice
 *   research        a POI's own site (a school, a county park) — NOT ticked
 *
 * Every photo still arrives `pending`; approving is a click in the table.
 */

import { useCallback, useEffect, useState } from 'react';

interface IngestResult {
  poi_name: string;
  found: number;
  added: number;
  skipped: Array<{ url: string; reason: string }>;
}

interface SourceRow {
  id: string;
  url: string;
  label: string | null;
  origin: 'community_site' | 'research' | 'manual';
  enabled: boolean;
  last_ingested_at: string | null;
  last_result: { found?: number; added?: number; skipped?: number; error?: string } | null;
}

const GROUPS: Array<{ origin: SourceRow['origin']; title: string; blurb: string }> = [
  {
    origin: 'community_site',
    title: 'The community’s own site',
    blurb: 'Found by research, plus every page one click from it. Read by default.',
  },
  {
    origin: 'manual',
    title: 'Pages you added',
    blurb: 'Fetched when you pasted them. Untick to keep them out of future runs.',
  },
  {
    origin: 'research',
    title: 'Other sites research found',
    blurb:
      'A school’s or a park’s own page. Off by default — tick one and the next Fetch Sites will read it.',
  },
];

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
  const [sources, setSources] = useState<SourceRow[]>([]);

  const loadSources = useCallback(async () => {
    const res = await fetch(`/api/admin/community-tour/${communityId}/sources`);
    if (!res.ok) return;
    setSources(((await res.json()) as { sources: SourceRow[] }).sources);
  }, [communityId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  async function toggle(row: SourceRow) {
    // Optimistic: the round trip is one boolean, and a checkbox that waits for
    // the network to agree reads as broken.
    setSources((prev) => prev.map((s) => (s.id === row.id ? { ...s, enabled: !row.enabled } : s)));
    const res = await fetch(`/api/admin/community-tour/${communityId}/sources`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
    });
    if (!res.ok) {
      setError('Could not save that — reloading the list.');
      await loadSources();
    }
  }

  async function submit() {
    const target = url.trim();
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
      await loadSources();
      onIngested();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  const enabledCount = sources.filter((s) => s.enabled).length;
  const unreadCount = sources.filter((s) => s.enabled && !s.last_ingested_at).length;

  return (
    // Collapsed by default (owner 2026-08-20). Most sessions are review, and
    // this panel sat open between the pipeline strip and the table an admin
    // actually works in. The summary carries the counts, so there is a reason
    // to open it — and "N not read yet" is the one that says Fetch Sites has
    // work waiting.
    <details className="rounded-2xl border border-line bg-surface">
      <summary className="cursor-pointer p-4 font-semibold text-ink text-sm">
        Photo sources
        <span className="ml-2 font-normal text-ink2 text-xs">
          {sources.length === 0
            ? 'none yet — run Fetch Sites, or paste a page below'
            : `${enabledCount} of ${sources.length} ticked${unreadCount > 0 ? ` · ${unreadCount} not read yet` : ''}`}
        </span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-muted">
          Every image on a ticked page lands in the photo table below as pending, for you to approve
          or reject. Ticking a page does not fetch it — the{' '}
          <span className="font-medium text-ink2">Fetch Sites</span> step does, and it skips pages
          it has already read.
        </p>

        {sources.length > 0 && (
          <div className="mt-4 space-y-4">
            {GROUPS.map((g) => {
              const rows = sources.filter((s) => s.origin === g.origin);
              if (rows.length === 0) return null;
              return (
                <div key={g.origin}>
                  <div className="font-medium text-ink text-xs">
                    {g.title} <span className="font-normal text-ink2">({rows.length})</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{g.blurb}</p>
                  <ul className="mt-2 space-y-1">
                    {rows.map((row) => (
                      <li key={row.id} className="flex items-start gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={() => void toggle(row)}
                          aria-label={`Read ${row.url}`}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="shrink-0 font-medium text-ink">{row.label ?? 'Page'}</span>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-ink2 underline"
                          title={row.url}
                        >
                          {row.url.replace(/^https?:\/\//, '')}
                        </a>
                        <span className="shrink-0 text-muted">{outcomeOf(row)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border-line border-t pt-3">
          <div className="font-medium text-ink text-xs">Add a page</div>
          <p className="mt-0.5 text-[11px] text-muted">
            Fetched immediately, and remembered as a source. Leave the second field blank to file
            the photos under “Amenities”, or name what the page shows (Pool, Clubhouse, Tennis) to
            keep sources apart in the tour.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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
        </div>

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

/** "12 photos" / "read, none usable" / "not read yet". */
function outcomeOf(row: SourceRow): string {
  if (!row.last_ingested_at) return row.enabled ? 'not read yet' : '—';
  if (row.last_result?.error) return row.last_result.error;
  const added = row.last_result?.added ?? 0;
  return added > 0 ? `${added} photo${added === 1 ? '' : 's'}` : 'read, nothing usable';
}
