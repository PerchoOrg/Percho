'use client';

/**
 * ClaimGrid — client component that renders the unclaimed-neighborhood
 * pool with a search input and a per-row Claim button.
 *
 * Phase 83 (2026-07-15). Kept intentionally simple: no map preview, no
 * filters beyond a name-substring search. The whole page is ~100 rows in
 * the typical browsing session (paginated at 1000 in the parent), so a
 * client-side filter is fine.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claimCommunity, type ClaimResult } from './actions';

type Row = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  description: string | null;
  hero_image_url: string | null;
  residents_count: string | null;
  avg_income: string | null;
  friendliness_score: number | null;
  attributes: string[] | null;
};

export function ClaimGrid({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.city?.toLowerCase().includes(needle) ||
        r.attributes?.some((a) => a.toLowerCase().includes(needle)),
    );
  }, [q, rows]);

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search neighborhoods, cities, attributes…"
        className="mb-6 w-full rounded-lg border border-cream/15 bg-ink/60 px-4 py-2 text-cream placeholder:text-cream/40 focus:border-bronze focus:outline-none"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => (
          <ClaimCard key={r.id} row={r} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-cream/50">No matches.</p>
      ) : null}
    </>
  );
}

function ClaimCard({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onClaim() {
    setMsg(null);
    startTransition(async () => {
      const r: ClaimResult = await claimCommunity(row.id);
      if (r.ok) {
        router.push(`/dashboard/communities/${r.id}`);
        return;
      }
      if (r.error === 'already-claimed') setMsg('Already claimed — refresh to update.');
      else if (r.error === 'not-an-agent') setMsg('Your account is not an agent.');
      else if (r.error === 'unauthenticated') setMsg('Please sign in.');
      else setMsg(r.message || 'Failed — please retry.');
    });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-cream/10 bg-ink/40">
      <div
        className="aspect-video bg-gradient-to-br from-bronze/20 to-ink/60 bg-cover bg-center"
        style={row.hero_image_url ? { backgroundImage: `url(${row.hero_image_url})` } : undefined}
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-medium text-cream">{row.name}</h3>
          <p className="text-xs text-cream/50">
            {row.city ? `${row.city}, ${row.state}` : row.state}
          </p>
        </div>
        {row.description ? (
          <p className="line-clamp-2 text-xs text-cream/60">{row.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-cream/50">
          {row.residents_count ? <span>{row.residents_count} residents</span> : null}
          {row.avg_income ? <span>{row.avg_income} income</span> : null}
          {row.friendliness_score != null ? (
            <span>friendly {row.friendliness_score}</span>
          ) : null}
        </div>
        {row.attributes && row.attributes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.attributes.slice(0, 4).map((a) => (
              <span
                key={a}
                className="rounded-full border border-cream/10 bg-cream/5 px-2 py-0.5 text-[10px] text-cream/60"
              >
                {a}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClaim}
          disabled={pending}
          className="mt-auto rounded-md bg-bronze px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-bronze/90 disabled:opacity-50"
        >
          {pending ? 'Claiming…' : 'Claim'}
        </button>
        {msg ? <span className="text-[11px] text-rose-400">{msg}</span> : null}
      </div>
    </div>
  );
}
