/**
 * /admin/pipeline/nearby — unified Nearby index with a segmented
 * control switching between Home (per-listing) and Neighborhood
 * (per-community) tables.
 *
 * Rows link into the existing per-entity detail pages
 * (/admin/pipeline/listing-nearby/[id], /admin/pipeline/community-nearby/[id])
 * which are unchanged.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Scope = 'home' | 'neighborhood';

type ListingRow = {
  id: string;
  address: string;
  city: string;
  state: string;
  status: string;
  community_id: string | null;
  agents: { name: string; slug: string } | null;
};

type CommunityRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type ScopeStat = { ready: number; pending: number; failed: number };

async function loadHome(filter: string) {
  const supabase = createServiceClient();
  let q = supabase
    .from('listings')
    .select('id, address, city, state, status, community_id, agents(name, slug)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter === 'no-community') q = q.is('community_id', null);
  if (filter === 'with-community') q = q.not('community_id', 'is', null);
  const { data } = (await q) as { data: ListingRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const statsMap = new Map<string, ScopeStat>();
  if (ids.length > 0) {
    const { data: gv } = (await supabase
      .from('generated_videos')
      .select('listing_id, status')
      .eq('scope', 'listing_intent_bucket')
      .in('listing_id', ids)) as {
      data: Array<{ listing_id: string; status: string }> | null;
    };
    for (const r of gv ?? []) {
      const s = statsMap.get(r.listing_id) ?? { ready: 0, pending: 0, failed: 0 };
      if (r.status === 'ready' || r.status === 'approved') s.ready += 1;
      else if (r.status === 'failed') s.failed += 1;
      else s.pending += 1;
      statsMap.set(r.listing_id, s);
    }
  }
  return rows.map((r) => ({
    ...r,
    stats: statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 },
  }));
}

async function loadNeighborhood() {
  const supabase = createServiceClient();
  const { data } = (await supabase
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })
    .limit(200)) as { data: CommunityRow[] | null };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const statsMap = new Map<string, ScopeStat>();
  if (ids.length > 0) {
    const { data: gv } = (await supabase
      .from('generated_videos')
      .select('community_id, status')
      .eq('scope', 'community_intent_bucket')
      .in('community_id', ids)) as {
      data: Array<{ community_id: string; status: string }> | null;
    };
    for (const r of gv ?? []) {
      const s = statsMap.get(r.community_id) ?? { ready: 0, pending: 0, failed: 0 };
      if (r.status === 'ready' || r.status === 'approved') s.ready += 1;
      else if (r.status === 'failed') s.failed += 1;
      else s.pending += 1;
      statsMap.set(r.community_id, s);
    }
  }
  return rows.map((r) => ({
    ...r,
    stats: statsMap.get(r.id) ?? { ready: 0, pending: 0, failed: 0 },
  }));
}

export default async function NearbyIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; filter?: string }>;
}) {
  const { scope: rawScope, filter = 'no-community' } = await searchParams;
  const scope: Scope = rawScope === 'neighborhood' ? 'neighborhood' : 'home';

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Nearby</h1>
        <p className="text-ink2 mt-1 text-sm">
          POI discovery + bucket videos. Home = per-listing (no community assigned yet).
          Neighborhood = per-community, shared by every listing inside.
        </p>
      </header>

      {/* Segmented control */}
      <div className="inline-flex rounded-full border border-line bg-surface p-1 text-sm">
        {[
          { id: 'home', label: 'Home' },
          { id: 'neighborhood', label: 'Neighborhood' },
        ].map((s) => {
          const isActive = scope === s.id;
          return (
            <Link
              key={s.id}
              href={`/admin/pipeline/nearby?scope=${s.id}`}
              className={`rounded-full px-4 py-1.5 transition ${
                isActive ? 'bg-ink text-bg font-medium' : 'text-ink2 hover:text-ink'
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {scope === 'home' ? (
        <HomeTable filter={filter} rows={await loadHome(filter)} />
      ) : (
        <NeighborhoodTable rows={await loadNeighborhood()} />
      )}
    </div>
  );
}

function HomeTable({
  filter,
  rows,
}: {
  filter: string;
  rows: Array<ListingRow & { stats: ScopeStat }>;
}) {
  return (
    <>
      <nav className="flex gap-2 text-sm">
        {[
          { id: 'no-community', label: 'No community' },
          { id: 'with-community', label: 'Has community' },
          { id: 'all', label: 'All' },
        ].map((f) => (
          <Link
            key={f.id}
            href={`/admin/pipeline/nearby?scope=home&filter=${f.id}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink2 hover:text-ink'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
            <tr>
              <th className="p-3">Listing</th>
              <th className="p-3">Agent</th>
              <th className="p-3">Community</th>
              <th className="p-3 text-right">Videos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink2">
                  No listings match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <div className="font-medium">{r.address}</div>
                  <div className="text-ink2 text-xs">
                    {r.city}, {r.state} · {r.status}
                  </div>
                </td>
                <td className="p-3 text-ink2">{r.agents?.name ?? '—'}</td>
                <td className="p-3 text-ink2">
                  {r.community_id ? (
                    <span className="text-xs">community-scoped</span>
                  ) : (
                    <span className="text-xs text-amber-500">unassigned</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <span className="text-emerald-500">{r.stats.ready}</span>
                  <span className="text-ink2"> / </span>
                  <span>{r.stats.pending}</span>
                  {r.stats.failed > 0 && (
                    <>
                      <span className="text-ink2"> / </span>
                      <span className="text-red-500">{r.stats.failed}</span>
                    </>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Link
                    href={`/admin/pipeline/listing-nearby/${r.id}`}
                    className="text-sm text-blue-500 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NeighborhoodTable({
  rows,
}: {
  rows: Array<CommunityRow & { stats: ScopeStat }>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line bg-bg/40 text-left text-xs uppercase tracking-wide text-ink2">
          <tr>
            <th className="p-3">Community</th>
            <th className="p-3">Location</th>
            <th className="p-3 text-right">Videos</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-ink2">
                No communities yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="p-3 font-medium">{r.name}</td>
              <td className="p-3 text-ink2">
                {[r.city, r.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="p-3 text-right">
                <span className="text-emerald-500">{r.stats.ready}</span>
                <span className="text-ink2"> / </span>
                <span>{r.stats.pending}</span>
                {r.stats.failed > 0 && (
                  <>
                    <span className="text-ink2"> / </span>
                    <span className="text-red-500">{r.stats.failed}</span>
                  </>
                )}
              </td>
              <td className="p-3 text-right">
                <Link
                  href={`/admin/pipeline/community-nearby/${r.id}`}
                  className="text-sm text-blue-500 hover:underline"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
