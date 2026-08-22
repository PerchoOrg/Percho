'use client';

/**
 * Shared admin table with:
 * - Top-right search (client-side substring over `searchable(row)`, or
 *   server-side via `serverSearchParam`)
 * - Click-to-sort on every column (three-state: asc → desc → none)
 * - 20 rows/page + Prev/Next
 *
 * Rows are passed pre-fetched from the server page. Columns are declared
 * per-table so each page keeps its own cell-render logic.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

export type AdminColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Value used for sorting this column. If omitted, column is not sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
  className?: string;
};

export type AdminTableProps<T> = {
  rows: T[];
  columns: AdminColumn<T>[];
  /** String used to match the search query for this row. */
  searchable: (row: T) => string;
  rowKey: (row: T) => string;
  emptyMessage?: string;
  minWidth?: number;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  pageSize?: number;
  /**
   * Opt in to server-side search: the box reads and writes this URL search
   * param, and `rows` is expected to arrive already filtered, so the local
   * substring pass is skipped.
   *
   * Without it the box filters the pre-fetched rows in the browser, which is
   * only honest when the page hands down every row that could ever match. A
   * page that caps its query needs this — otherwise the box quietly searches
   * the cap instead of the table.
   */
  serverSearchParam?: string;
};

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function AdminTable<T>({
  rows,
  columns,
  searchable,
  rowKey,
  emptyMessage = 'No rows.',
  minWidth = 640,
  searchPlaceholder = 'Search…',
  pageSize = 20,
  serverSearchParam,
}: AdminTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = serverSearchParam ? (params.get(serverSearchParam) ?? '') : '';

  const [query, setQuery] = useState(urlQuery);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);

  // The input stays controlled and instant; the round-trip is debounced so a
  // word typed at speed is one navigation, not one per letter. `typed` gates
  // it to real keystrokes — without that, arriving at a URL would push that
  // same URL straight back and Back would never escape.
  const typed = useRef(false);
  useEffect(() => {
    if (!serverSearchParam || !typed.current) return;
    const t = setTimeout(() => {
      typed.current = false;
      const next = new URLSearchParams(params.toString());
      if (query) next.set(serverSearchParam, query);
      else next.delete(serverSearchParam);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [query, serverSearchParam, params, pathname, router]);

  // …and the other direction, so Back/forward moves the box too.
  useEffect(() => {
    if (!typed.current) setQuery(urlQuery);
  }, [urlQuery]);

  const filtered = useMemo(() => {
    // Server-side search already narrowed `rows` — re-running the predicate
    // here would only re-filter a set that is by definition already filtered.
    if (serverSearchParam) return rows;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchable(r).toLowerCase().includes(q));
  }, [rows, query, searchable, serverSearchParam]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dirMul = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort(
      (a, b) => dirMul * compareValues(col.sortValue!(a), col.sortValue!(b)),
    );
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  const paged = sorted.slice(pageStart, pageStart + pageSize);

  function toggleSort(key: string) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
    setPage(0);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            typed.current = true;
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className="w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const arrow = active ? (sort!.dir === 'asc' ? ' ↑' : ' ↓') : '';
                const sortable = !!c.sortValue;
                const alignCls = c.align === 'right' ? 'text-right' : 'text-left';
                return (
                  <th
                    key={c.key}
                    className={`p-3 ${alignCls} ${c.className ?? ''} ${
                      sortable ? 'cursor-pointer select-none hover:text-ink' : ''
                    }`}
                    onClick={sortable ? () => toggleSort(c.key) : undefined}
                  >
                    {c.header}
                    {sortable && <span className="text-ink2">{arrow || ' ↕'}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-ink2">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {paged.map((r) => (
              <tr key={rowKey(r)} className="border-b border-line align-top last:border-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`p-3 ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-ink2">
        <div>
          {sorted.length === 0
            ? '0 results'
            : `${pageStart + 1}–${Math.min(pageStart + pageSize, sorted.length)} of ${sorted.length}`}
          {query && rows.length !== sorted.length && (
            <span className="text-ink2"> (filtered from {rows.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-line px-2 py-1 disabled:opacity-40 hover:border-ink disabled:hover:border-line"
          >
            ← Prev
          </button>
          <span>
            Page {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="rounded-lg border border-line px-2 py-1 disabled:opacity-40 hover:border-ink disabled:hover:border-line"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
