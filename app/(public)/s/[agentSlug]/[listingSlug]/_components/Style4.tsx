/**
 * Style 4 — Luxury Brochure.
 *
 * Refined typography, paper background (`bg-bg`/`bg-surface`), embedded
 * video card with a hairline frame, two-column on tablet+, generous
 * whitespace. Follows luxury-redesign-playbook three-tier rule:
 *   Tier 1 (page bg): #f3eee7 paper
 *   Tier 2 (cards/panels): #fbf8f3 surface
 *   Tier 3 (text/lines): #313131 ink + line/line-strong hairlines
 * NO gold, NO chromatic accents — segment coherence per playbook §1.
 */

import {
  type ShowcaseData,
  agentFullUrl,
  communityBlurb,
  communityFullUrl,
  formatPrice,
  formatSpecs,
  listingFullUrl,
} from './shared';

export function Style4LuxuryBrochure({
  data,
  communitySlug,
}: {
  data: ShowcaseData;
  communitySlug: string | null;
}) {
  const { bundle, heroImage, heroVideo, album, communityImage } = data;
  const { listing, agent, community } = bundle;
  const price = formatPrice(listing.price);
  const specs = formatSpecs(listing.beds, listing.baths, listing.sqft);
  const blurb = communityBlurb(community?.description ?? null);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-10 sm:py-16">
        {/* Wordmark + meta */}
        <div className="flex items-baseline justify-between border-line border-b pb-5">
          <p className="font-serif text-ink text-lg tracking-tighter">Vicinity</p>
          <p className="text-[10px] uppercase tracking-eyebrow text-ink2">Featured residence</p>
        </div>

        {/* Title block */}
        <header className="mt-10 sm:mt-14">
          <p className="text-[11px] uppercase tracking-eyebrow text-ink2">
            {listing.city}, {listing.state}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tighter text-ink sm:text-6xl">
            {listing.address}
          </h1>
          {price ? <p className="mt-3 font-serif text-2xl text-ink2 sm:text-3xl">{price}</p> : null}
        </header>

        {/* Two-column: framed video card + spec list */}
        <div className="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-[3fr_2fr] sm:items-start">
          <figure className="rounded-sm border border-line bg-surface p-2 shadow-sm">
            {heroVideo ? (
              <video
                src={heroVideo}
                poster={heroImage}
                autoPlay
                muted
                loop
                playsInline
                className="aspect-[4/5] h-auto w-full object-cover sm:aspect-[5/6]"
              >
                <track kind="captions" />
              </video>
            ) : (
              // biome-ignore lint/nursery/noImgElement: external CDN
              <img
                src={heroImage}
                alt={listing.address}
                className="aspect-[4/5] h-auto w-full object-cover sm:aspect-[5/6]"
              />
            )}
          </figure>

          <div>
            {specs.length > 0 ? (
              <dl className="divide-y divide-line border-line border-y">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between py-3">
                    <dt className="text-[11px] uppercase tracking-eyebrow text-ink2">{s.label}</dt>
                    <dd className="font-serif text-2xl text-ink">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {listing.description && listing.description.length > 0 ? (
              <div className="mt-6 space-y-3 text-ink2 text-sm leading-relaxed">
                {listing.description
                  .filter((s) => s && s.trim().length > 0)
                  .slice(0, 2)
                  .map((p) => (
                    <p key={p.slice(0, 32)}>{p}</p>
                  ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Community panel */}
        {community ? (
          <section className="mt-14 rounded-sm border border-line bg-surface p-6 sm:mt-20 sm:p-10">
            <div className="grid gap-6 sm:grid-cols-[2fr_3fr] sm:items-center">
              {communityImage ? (
                // biome-ignore lint/nursery/noImgElement: external CDN
                <img
                  src={communityImage}
                  alt={community.name}
                  className="aspect-[4/5] w-full rounded-sm object-cover sm:aspect-[3/4]"
                />
              ) : null}
              <div>
                <p className="text-[11px] uppercase tracking-eyebrow text-ink2">Neighborhood</p>
                <h2 className="mt-2 font-serif text-2xl text-ink sm:text-3xl">{community.name}</h2>
                {blurb ? <p className="mt-3 text-ink2 text-sm leading-relaxed">{blurb}</p> : null}
                {communitySlug ? (
                  <a
                    href={communityFullUrl(communitySlug)}
                    className="mt-4 inline-block text-ink text-sm underline decoration-line-strong underline-offset-4 hover:text-ink"
                  >
                    View community details →
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Gallery strip */}
        {album.length > 1 ? (
          <section className="mt-14 sm:mt-20">
            <p className="text-[11px] uppercase tracking-eyebrow text-ink2">Gallery</p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {album.slice(1, 5).map((src) => (
                // biome-ignore lint/nursery/noImgElement: external CDN
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="aspect-square w-full rounded-sm object-cover"
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* CTA */}
        <section className="mt-14 border-line border-t pt-10 text-center sm:mt-20">
          <a
            href={listingFullUrl(agent.slug, listing.slug)}
            className="inline-flex items-center justify-center rounded-full border border-line-strong bg-ink px-8 py-3 text-cream text-sm tracking-wide transition hover:bg-accent-dark"
          >
            View full listing →
          </a>
          <p className="mt-5 text-ink2 text-xs">
            Presented by{' '}
            <a
              href={agentFullUrl(agent.slug)}
              className="underline decoration-line-strong underline-offset-4 hover:text-ink"
            >
              {agent.name}
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
