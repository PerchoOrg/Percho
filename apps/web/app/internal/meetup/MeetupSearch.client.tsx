'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type MeetupEntry = {
  slug: string;
  title: string;
  preview: string;
};

export type MeetupGroup = {
  slug: string;
  title: string;
  entries: MeetupEntry[];
};

/**
 * MeetupSearch — client-side filter over the meetup docs index.
 *
 * When the query is empty, renders the grouped layout (one section per
 * folder, order preserved from the server). When the query is non-empty,
 * renders a single flat list of matches across all folders, with the
 * folder title shown as an eyebrow so the reader still knows where the
 * doc lives. Case-insensitive substring match on title + preview + slug.
 */
export function MeetupSearch({ groups }: { groups: MeetupGroup[] }) {
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();

  const flatMatches = useMemo(() => {
    if (!query) return [];
    const hits: Array<{ folderTitle: string; folderSlug: string; entry: MeetupEntry }> = [];
    for (const g of groups) {
      for (const e of g.entries) {
        const hay = `${e.title} ${e.preview} ${e.slug}`.toLowerCase();
        if (hay.includes(query)) {
          hits.push({ folderTitle: g.title, folderSlug: g.slug, entry: e });
        }
      }
    }
    return hits;
  }, [groups, query]);

  return (
    <div className="space-y-10">
      <div>
        <label htmlFor="meetup-search" className="sr-only">
          Search docs
        </label>
        <input
          id="meetup-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search docs (title, preview)…"
          className="w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-line-strong"
          autoComplete="off"
        />
        {query && (
          <p className="mt-2 text-xs text-muted">
            {flatMatches.length} match{flatMatches.length === 1 ? '' : 'es'} for “{q.trim()}”
          </p>
        )}
      </div>

      {query ? (
        flatMatches.length === 0 ? (
          <p className="text-sm text-muted">No docs match.</p>
        ) : (
          <ul className="space-y-3">
            {flatMatches.map(({ folderTitle, entry }) => (
              <li key={entry.slug}>
                <Link
                  href={`/internal/meetup/${entry.slug}`}
                  className="block rounded border border-line bg-surface px-4 py-3 hover:border-line-strong"
                >
                  <div className="text-xs uppercase tracking-eyebrow text-muted">
                    {folderTitle}
                  </div>
                  <div className="mt-1 font-medium">{entry.title}</div>
                  {entry.preview && (
                    <div className="mt-1 text-sm text-ink2 line-clamp-2">{entry.preview}</div>
                  )}
                  <div className="mt-1 text-xs text-muted font-mono">{entry.slug}.md</div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        groups.map((g) => (
          <section key={g.slug} id={g.slug} className="space-y-3 scroll-mt-6">
            <h2 className="text-xl font-serif tracking-tighter border-b border-line pb-1">
              {g.title}
            </h2>
            {g.entries.length === 0 ? (
              <p className="text-sm text-muted">No markdown files.</p>
            ) : (
              <ul className="space-y-3">
                {g.entries.map((e) => (
                  <li key={e.slug}>
                    <Link
                      href={`/internal/meetup/${e.slug}`}
                      className="block rounded border border-line bg-surface px-4 py-3 hover:border-line-strong"
                    >
                      <div className="font-medium">{e.title}</div>
                      {e.preview && (
                        <div className="mt-1 text-sm text-ink2 line-clamp-2">{e.preview}</div>
                      )}
                      <div className="mt-1 text-xs text-muted font-mono">{e.slug}.md</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
