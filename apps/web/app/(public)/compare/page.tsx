/**
 * `/compare?ids=a,b[,c…]` — 2–5 saved neighbourhoods side by side (phase311).
 *
 * The web twin of the iOS `/compare-communities` screen, built from the same
 * code: the take and the table come from `@percho/shared/community-compare`
 * and `community-take`, fed the same `CommunityDetailDTO` the phone fetches
 * from `/api/mobile/community/[id]`. The web has no stated priorities (the
 * phone's You tab), so rows keep their default order.
 *
 * Needs an account, like saving (owner: "保存和对比要求登录"). Reached from
 * Favorites, which only a signed-in viewer can fill.
 */
import { loginHref } from '@/lib/auth/login-href';
import { type CommunityDetailDTO, fetchCommunityDetail } from '@/lib/communities/detail';
import { createClient } from '@/lib/supabase/server';
import { compareIdsSchema } from '@/lib/zod/compare';
import {
  COMMUNITY_COMPARE_MIN,
  buildCommunityCompareTable,
} from '@percho/shared/community-compare';
import { buildCommunityTake } from '@percho/shared/community-take';
import type { CompareTableRow } from '@percho/shared/compare-table';
import { splitRows } from '@percho/shared/compare-take';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Compare · Percho',
};

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: raw = '' } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginHref(`/compare?ids=${encodeURIComponent(raw)}`));

  const parsed = compareIdsSchema.safeParse(raw);
  if (!parsed.success) {
    return <Message text="Pick two to five saved neighborhoods to compare." />;
  }

  const details = await Promise.all(parsed.data.map((id) => fetchCommunityDetail(id)));
  // A community that is gone (delisted, or a stale saved id) drops out; one
  // column is not a comparison.
  const communities = details.filter((c): c is CommunityDetailDTO => c !== null);
  if (communities.length < COMMUNITY_COMPARE_MIN) {
    return <Message text="Couldn’t load these neighborhoods." />;
  }

  const table = buildCommunityCompareTable(communities);
  const take = buildCommunityTake(communities);
  // Only the basics collapse; the four aspect sections are always whole.
  const { shown } = splitRows(table.basics, false);
  const hidden = table.basics.slice(shown.length);
  const columns = table.headers.length;

  return (
    <main className="min-h-dvh bg-bg pb-24 text-ink md:pb-10">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Link href="/saved" className="text-ink2 text-sm hover:text-ink">
          ‹ Favorites
        </Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Compare</h1>

        <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <div className="text-[11px] text-ink2 uppercase tracking-eyebrow">Percho’s take</div>
          <p className="mt-2 font-serif text-[17px] text-ink leading-relaxed">{take.lead}</p>
          {take.points.map((p) => (
            <p key={p} className="mt-2 flex gap-2 text-ink2 text-sm leading-snug">
              <span className="text-muted" aria-hidden="true">
                —
              </span>
              <span>{p}</span>
            </p>
          ))}
          {take.caveat ? (
            <p className="mt-3 text-ink2 text-sm italic leading-snug">{take.caveat}</p>
          ) : null}
        </section>

        <h2 className="mt-8 font-medium text-ink text-sm">The numbers behind it</h2>
        <Cells columns={columns} className="mt-3">
          {table.headers.map((h) => (
            <Link key={h.id} href={`/c/${h.slug}`} className="group min-w-0">
              {h.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.thumbUrl}
                  alt=""
                  className="aspect-[4/3] w-full rounded-lg bg-line object-cover"
                />
              ) : (
                <div className="aspect-[4/3] w-full rounded-lg bg-line" />
              )}
              <div className="mt-1.5 font-medium text-ink text-sm leading-tight group-hover:underline">
                {h.name}
              </div>
              {h.place ? <div className="text-muted text-xs">{h.place}</div> : null}
            </Link>
          ))}
        </Cells>

        {table.aspects.map((a) => (
          <Block key={a.key} title={a.title} note={a.note} rows={a.rows} columns={columns} />
        ))}

        <Block title="The basics" rows={shown} columns={columns}>
          {hidden.length > 0 ? (
            <details className="group">
              <summary className="mt-3 cursor-pointer list-none text-ink2 text-sm underline underline-offset-2 hover:text-ink">
                <span className="group-open:hidden">Show all {table.basics.length} figures</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              {hidden.map((r) => (
                <Row key={r.label} row={r} columns={columns} />
              ))}
            </details>
          ) : null}
        </Block>

        <p className="mt-8 text-muted text-xs leading-relaxed">
          Built from these figures alone. Ratings come from residents whose review we approved, and
          a count is of the places we know about nearby, not a census.
        </p>
      </div>
    </main>
  );
}

function Message({ text }: { text: string }) {
  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">{text}</p>
        <Link href="/saved" className="mt-4 inline-block text-ink text-sm underline">
          Back to Favorites
        </Link>
      </div>
    </main>
  );
}

/** One equal-width cell per compared community. */
function Cells({
  columns,
  className = '',
  children,
}: {
  columns: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function Block({
  title,
  note,
  rows,
  columns,
  children,
}: {
  title: string;
  note?: string;
  rows: readonly CompareTableRow[];
  columns: number;
  children?: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-baseline gap-x-2 border-line border-b pb-1.5">
        <h3 className="font-medium text-[15px] text-ink">{title}</h3>
        {note ? <span className="text-muted text-xs">{note}</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-muted text-sm">Nothing on file for these.</p>
      ) : null}
      {rows.map((r) => (
        <Row key={r.label} row={r} columns={columns} />
      ))}
      {children}
    </section>
  );
}

/** Label above, one cell per community below; a "—" for a figure we lack. */
function Row({ row, columns }: { row: CompareTableRow; columns: number }) {
  const max = row.meterMax ?? 0;
  return (
    <div className="border-line border-b py-2.5">
      <div className="text-ink2 text-xs">
        {row.label}
        {row.note ? <span className="text-muted"> · {row.note}</span> : null}
      </div>
      <Cells columns={columns} className="mt-1">
        {row.cells.map((c, i) => {
          const v = row.meter?.[i];
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional — column i is community i
            <div key={i} className="min-w-0">
              <div className={`text-sm ${c ? 'text-ink' : 'text-muted'}`}>{c ?? '—'}</div>
              {max > 0 && v !== undefined ? (
                <div className="mt-1 h-1 w-full rounded-full bg-line">
                  <div
                    className="h-1 rounded-full bg-[#c9a24a]"
                    style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </Cells>
    </div>
  );
}
