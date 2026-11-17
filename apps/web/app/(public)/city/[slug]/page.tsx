/**
 * /city/[slug] — a city's page on the web (phase335).
 *
 * Built for the link the iOS app shares: an agent sends a city card, and a
 * buyer WITHOUT the app lands here (with the app, iOS opens the app's own city
 * page — `lib/share/app-links.ts`). So it is the app's city page, compact: the
 * film, then each fundamental as a figure that links to its source (phase334's
 * rule), then the communities in the city — the way on to everything else —
 * and the app.
 *
 * Same data as the app (`fetchCityDetail`, the shape `/api/mobile/city/<slug>`
 * sends). No safety section, on purpose — see `packages/shared/src/city.ts`.
 * The history and the plans the app draws as a timeline and a fold are a row
 * of labels and a fold here; the owner found the long version "又臭又长".
 */

import { CommunityFilm } from '@/app/(public)/_components/CommunityFilm';
import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { fetchCityDetail } from '@/lib/cities/detail';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { APP_STORE_URL, sharedPageMetadata, siteOrigin } from '@/lib/share/app-links';
import type { CityDetailDTO, CitySource } from '@percho/shared/city';
import { buildTourChapters } from '@percho/shared/tour-buckets';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { cache } from 'react';

type PageParams = { slug: string };

/** One read per request: the metadata and the page both need the city. */
const getCity = cache(fetchCityDetail);

const LEVELS = [
  ['elementary', 'Elementary'],
  ['middle', 'Middle'],
  ['high', 'High'],
  ['college', 'College'],
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city) return { title: 'City not found' };
  return sharedPageMetadata({
    title: `${city.name}, ${city.state}`,
    description: city.tagline,
    path: `/city/${city.slug}`,
    image: city.posterUrl ?? null,
    origin: siteOrigin(),
  });
}

export default async function CityPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();

  // The communities in this city that a buyer can open — the grid's own set,
  // which holds only communities with a film (phase310).
  const communities = (await fetchCommunityListCards()).filter(
    (c) => c.state === city.state && c.city?.trim().toLowerCase() === city.name.toLowerCase(),
  );

  const where = [city.county ? `${city.county} County` : null, city.state]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      {/* Not `HeroControl`: that is white glass for a dark hero, and this page
          opens on the cream background (phase335.1). */}
      <Link href="/communities" className="mb-3 inline-block text-ink2 text-sm hover:text-ink">
        ← Neighborhoods
      </Link>

      <header>
        <p className="font-medium text-muted text-xs uppercase tracking-[0.14em]">City · {where}</p>
        <h1 className="mt-1 font-semibold text-3xl tracking-tight">{city.name}</h1>
        <p className="mt-2 text-ink2 leading-snug">{city.tagline}</p>
      </header>

      {city.videoUrl ? (
        <div className="-mx-1">
          <CommunityFilm
            url={city.videoUrl}
            poster={city.posterUrl ?? null}
            credits={city.credits.google}
            chapters={buildTourChapters(city.tourSegments)}
          />
        </div>
      ) : null}

      {city.rankings.length > 0 ? (
        <Section title="Rankings">
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {city.rankings.map((r) => (
              <Sourced
                key={`${r.rank}-${r.title}`}
                source={r.source}
                className="w-56 shrink-0 snap-start rounded-xl bg-surface p-3"
              >
                <p className="font-semibold text-2xl">
                  {r.rank} <span className="font-normal text-muted text-sm">{r.scope}</span>
                </p>
                <p className="mt-1 font-medium text-sm leading-snug">{r.title}</p>
                <p className="mt-1 text-muted text-xs">
                  {[r.source.name, r.source.year].filter(Boolean).join(' · ')}
                </p>
              </Sourced>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          {city.stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-surface p-3">
              <p className="font-semibold text-xl">{s.value}</p>
              <p className="text-ink2 text-sm">{s.label}</p>
              {s.note ? <p className="text-muted text-xs">{s.note}</p> : null}
            </div>
          ))}
        </div>
        {city.compare.rows.length > 0 ? (
          <Sourced source={city.compare.source} className="mt-2 block rounded-xl bg-surface p-3">
            <div className="space-y-3">
              {city.compare.rows.map((row) => (
                <CompareRow
                  key={row.label}
                  row={row}
                  cityName={city.name}
                  against={city.compare.against}
                />
              ))}
            </div>
          </Sourced>
        ) : null}
      </Section>

      {city.education.schools.length > 0 ? (
        <Section title="Schools">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LEVELS.map(([level, label]) => {
              const schools = city.education.schools.filter((s) => s.level === level);
              if (schools.length === 0) return null;
              return (
                <div key={level} className="rounded-xl bg-surface p-3">
                  <p className="font-medium text-muted text-xs uppercase tracking-wide">{label}</p>
                  <ul className="mt-1 space-y-2">
                    {schools.map((s) => (
                      <li key={s.name}>
                        <Sourced source={s.source} className="block">
                          {s.rank ? (
                            <span className="font-semibold">
                              {s.rank}{' '}
                              <span className="font-normal text-muted text-xs">{s.scope}</span>
                            </span>
                          ) : null}
                          <span className="block text-sm leading-snug">{s.name}</span>
                        </Sourced>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {city.education.note ? (
            <p className="mt-2 text-muted text-xs">{city.education.note}</p>
          ) : null}
        </Section>
      ) : null}

      {city.gettingAround.length > 0 ? (
        <Section title="Getting around">
          <ul className="divide-y divide-ink/10 rounded-xl bg-surface px-3">
            {city.gettingAround.map((g) => (
              <li key={g.label} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-sm">{g.label}</span>
                <span className="text-right text-ink2 text-sm">{g.value}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {city.history.length > 0 ? (
        <Section title="History">
          <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {city.history.map((h) => (
              <li key={h.year} className="w-36 shrink-0 rounded-xl bg-surface p-3" title={h.text}>
                <p className="font-semibold text-sm">{h.year}</p>
                <p className="text-ink2 text-xs leading-snug">{h.short ?? h.text}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {city.planning.length > 0 ? (
        <details className="mt-8 rounded-xl bg-surface p-3">
          <summary className="cursor-pointer font-semibold">What's next</summary>
          <ul className="mt-2 space-y-2">
            {city.planning.map((p) => (
              <li key={p.title}>
                <p className="font-medium text-sm">{p.title}</p>
                <p className="text-ink2 text-sm leading-snug">{p.text}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {communities.length > 0 ? (
        <Section title={`Neighborhoods in ${city.name}`}>
          <div className="-mx-4">
            <CommunityGrid communities={communities} />
          </div>
        </Section>
      ) : null}

      <a
        href={APP_STORE_URL}
        className="mt-10 block rounded-xl bg-ink px-4 py-3 text-center font-medium text-surface"
      >
        Swipe every neighborhood in the Percho app
      </a>

      <PhotoCredits credits={city.credits} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** A figure that opens its source, marked " ↗" like the app (phase334). */
function Sourced({
  source,
  className,
  children,
}: {
  source: CitySource;
  className?: string;
  children: ReactNode;
}) {
  if (!source.url) return <div className={className}>{children}</div>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className ?? ''} hover:opacity-80`}
      title={`Source: ${source.name}`}
    >
      {children}
      <span className="sr-only"> (source: {source.name})</span>
      <span aria-hidden="true" className="text-muted text-xs">
        {' '}
        ↗
      </span>
    </a>
  );
}

function CompareRow({
  row,
  cityName,
  against,
}: {
  row: CityDetailDTO['compare']['rows'][number];
  cityName: string;
  against: string;
}) {
  const max = Math.max(row.city.value, row.state.value) || 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{row.label}</span>
        <span className="font-medium text-xs">{row.takeaway}</span>
      </div>
      {(
        [
          [cityName, row.city, 'bg-ink'],
          [against, row.state, 'bg-muted/50'],
        ] as const
      ).map(([name, v, color]) => (
        <div key={name} className="mt-1 flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-muted text-xs">{name}</span>
          <div className="h-2 flex-1 rounded-full bg-ink/5">
            <div
              className={`h-2 rounded-full ${color}`}
              style={{ width: `${(v.value / max) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs">{v.display}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Google's Places terms ask for the author wherever a photo is shown (the film
 * prints them under itself); a CC BY Commons file asks for author, licence and
 * a link — that is this fold.
 */
function PhotoCredits({ credits }: { credits: CityDetailDTO['credits'] }) {
  if (credits.commons.length === 0) return null;
  return (
    <details className="mt-6 text-muted text-xs">
      <summary className="cursor-pointer">Photo credits</summary>
      <ul className="mt-2 space-y-1">
        {credits.commons.map((c) => (
          <li key={c.url}>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">
              {c.author}
            </a>
            {c.licence ? `, ${c.licence}` : ''}, via Wikimedia Commons
          </li>
        ))}
      </ul>
    </details>
  );
}
