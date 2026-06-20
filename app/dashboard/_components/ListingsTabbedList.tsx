'use client';

/**
 * ListingsTabbedList — client island for the dashboard's listings table.
 *
 * Phase 35.3 (2026-06-17): tabs used to be <Link href="/dashboard?status=...">,
 * which kicked a server nav that re-rendered the whole page including the
 * DashboardMetrics block above. Tianrou flagged the metrics flash on tab
 * switch. This component receives all three statuses' rows up front and
 * filters in memory; tab change is a setState, no server round-trip,
 * metrics stay rendered. URL is kept in sync via router.replace so a
 * refresh / share still lands on the right tab.
 */

import { CopyLinkButton } from '@/app/dashboard/_components/CopyLinkButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type StatusTab = 'draft' | 'published' | 'archived';

export type ListingRow = {
  id: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  fallback_cover_url: string | null;
  updated_at: string;
};

type Props = {
  initialTab: StatusTab;
  agentSlug: string | null;
  /** All listings for the calling agent across draft/published/archived. */
  rows: ListingRow[];
  counts: Record<StatusTab, number>;
  /** Phase 43.10: 'grid' renders 2-up cards (mobile-friendly).
   * Default 'list' keeps the existing wide-row layout. */
  view?: 'list' | 'grid';
  /** Phase 45.13 (2026-06-20): owner round 5 #5 — hide the Draft/Published/
   * Archived pill row on /dashboard. When false, all listings render together
   * regardless of status (initialTab is ignored). Default true preserves the
   * old behaviour for any other surface that mounts this island. */
  showStatusTabs?: boolean;
};

function fmtPrice(n: number | null): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtBaths(n: number | null): string | null {
  if (n == null) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac >= 0.5) return `${whole}½`;
  return `${whole}`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'published'
      ? 'bg-ink/15 text-ink border-line-strong'
      : status === 'archived'
        ? 'bg-surface/5 text-muted border-line'
        : 'bg-ink2/15 text-ink2 border-line';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

export function ListingsTabbedList({ initialTab, agentSlug, rows, counts, view = 'list', showStatusTabs = true }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>(initialTab);

  // Keep URL in sync without triggering a server nav. router.replace with the
  // same pathname only updates the query string and does not re-fetch the
  // server component tree, so metrics above don't flicker. Use scroll: false
  // because tab switching shouldn't yank the user back to the top.
  useEffect(() => {
    if (!showStatusTabs) return; // no URL sync when filter row is hidden
    const target = activeTab === 'published' ? '/dashboard' : `/dashboard?status=${activeTab}`;
    router.replace(target, { scroll: false });
  }, [activeTab, router, showStatusTabs]);

  const filteredRows = showStatusTabs ? rows.filter((r) => r.status === activeTab) : rows;

  return (
    <>
      {showStatusTabs && (
        <div className="mb-4 flex items-center justify-end">
          <div className="flex items-center gap-2 text-xs">
            {(['draft', 'published', 'archived'] as const).map((tab) => {
              const isActive = activeTab === tab;
              const label =
                tab === 'draft' ? 'Draft' : tab === 'published' ? 'Published' : 'Archived';
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-3 py-1 transition ${
                    isActive ? 'bg-ink2/30 text-ink' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {label}
                  {counts[tab] > 0 && (
                    <span className={`ml-1.5 ${isActive ? 'text-ink2' : 'text-muted'}`}>
                      {counts[tab]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
          <p className="text-ink2 text-sm">
            {activeTab === 'draft'
              ? 'No drafts.'
              : activeTab === 'archived'
                ? 'No archived listings.'
                : 'No listings yet — tap + New listing above to add one.'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-5 md:gap-y-12">
          {filteredRows.map((l) => {
            const cover = l.cover_url ?? l.fallback_cover_url;
            const price = fmtPrice(l.price);
            return (
              <Link
                key={l.id}
                href={`/dashboard/listings/${l.id}/edit`}
                className="group block"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt=""
                      className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] ${
                        l.status === 'archived' ? 'opacity-60' : ''
                      }`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted text-xs">
                      No cover
                    </div>
                  )}
                  <div className="absolute right-2 top-2">
                    <StatusBadge status={l.status} />
                  </div>
                </div>
                <div className="pt-3">
                  {price && (
                    <div className="font-serif text-ink text-base leading-tight tracking-[-0.012em]">
                      {price}
                    </div>
                  )}
                  <div className="mt-1 truncate text-ink2 text-[12px]">
                    {l.address ?? '(no address)'}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                    {l.beds != null && <span>{l.beds} bd</span>}
                    {l.baths != null && <span>· {fmtBaths(l.baths)} ba</span>}
                    {l.sqft != null && <span>· {l.sqft.toLocaleString()} sqft</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredRows.map((l) => {
            const cover = l.cover_url ?? l.fallback_cover_url;
            const meta: string[] = [];
            if (l.beds != null) meta.push(`${l.beds} bd`);
            const baths = fmtBaths(l.baths);
            if (baths) meta.push(`${baths} ba`);
            if (l.sqft != null) meta.push(`${l.sqft.toLocaleString()} sqft`);
            const isPub = l.status === 'published';
            const publicPath = agentSlug ? `/v/${agentSlug}/${l.slug}` : null;
            const previewHref = `/dashboard/listings/${l.id}/preview`;
            const isExternal = isPub && !!publicPath;
            const coverHref = isExternal ? `${publicPath}?from=dashboard` : previewHref;
            const titleAttr = isExternal
              ? 'Open public listing ↗'
              : l.status === 'archived'
                ? 'Preview archived listing — public link is offline'
                : 'Preview draft listing — only you can see this';
            const overlayLabel = isExternal
              ? 'Open ↗'
              : l.status === 'archived'
                ? 'Archived'
                : 'Draft preview';
            return (
              <li
                key={l.id}
                className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:p-4"
              >
                <Link
                  href={coverHref}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener' : undefined}
                  className="group relative h-40 w-full shrink-0 overflow-hidden rounded-xl bg-bg sm:h-28 sm:w-44"
                  title={titleAttr}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt=""
                      className={`h-full w-full object-cover transition group-hover:opacity-90 ${
                        l.status === 'archived' ? 'opacity-60' : ''
                      }`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted text-xs">
                      No cover
                    </div>
                  )}
                  <span
                    className="pointer-events-none absolute right-2 top-2 rounded-full bg-bg px-2 py-0.5 text-[10px] text-ink2 opacity-0 transition group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    {overlayLabel}
                  </span>
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-serif text-ink text-xl">
                      {l.address ?? '(no address)'}
                    </h3>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="mt-0.5 text-ink2 text-sm">
                    {l.city && l.state ? `${l.city}, ${l.state}` : '—'}
                    {l.price != null && ` · ${fmtPrice(l.price)}`}
                  </p>
                  {meta.length > 0 && <p className="mt-1 text-muted text-xs">{meta.join(' · ')}</p>}
                  {isPub && publicPath && (
                    <div className="mt-3">
                      <CopyLinkButton path={publicPath} display={`vicinities.cc${publicPath}`} />
                    </div>
                  )}
                  {!isPub && (
                    <div className="mt-3 text-[11px] text-muted uppercase tracking-widest">
                      Publish to get a public link
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-2 sm:self-center">
                  {isPub && publicPath ? (
                    <Link
                      href={`${publicPath}?from=dashboard`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-ink text-xs hover:border-line-strong hover:text-ink"
                    >
                      View ↗
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/listings/${l.id}/preview`}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-ink text-xs hover:border-line-strong hover:text-ink"
                      title={
                        l.status === 'archived'
                          ? 'Preview archived listing'
                          : 'Preview draft listing'
                      }
                    >
                      Preview
                    </Link>
                  )}
                  <Link
                    href={`/dashboard/listings/${l.id}/edit`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-ink text-xs hover:border-line-strong hover:text-ink"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/dashboard/listings/${l.id}/analytics`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-ink text-xs hover:border-line-strong hover:text-ink"
                  >
                    Analytics
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
