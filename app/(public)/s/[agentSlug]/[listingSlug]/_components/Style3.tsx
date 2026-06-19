/**
 * Style 3 — Minimal Poster.
 *
 * One static screen, screenshot-friendly. Address + price + 1-line
 * community tag + 1 CTA, layered over a single large photo. Designed
 * specifically for forwarding as an image — no scroll, no extra info.
 *
 * Mobile-first; on tablet/desktop the photo gets a contained "poster"
 * frame instead of full-bleed so the framing reads like a postcard.
 */

import { type ShowcaseData, agentFullUrl, formatPrice, listingFullUrl } from './shared';

export function Style3MinimalPoster({
  data,
}: {
  data: ShowcaseData;
}) {
  const { bundle, heroImage } = data;
  const { listing, agent, community } = bundle;
  const price = formatPrice(listing.price);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-bg p-4 sm:p-10">
      <article className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-sm shadow-xl sm:max-w-lg">
        {/* biome-ignore lint/nursery/noImgElement: external CDN */}
        <img
          src={heroImage}
          alt={listing.address}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Top scrim — small wordmark */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute inset-x-0 top-0 px-5 pt-5 sm:px-7">
          <p className="text-[10px] uppercase tracking-eyebrow text-cream">Vicinity</p>
        </div>

        {/* Bottom scrim — info block */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-7 sm:pb-8">
          <p className="text-[10px] uppercase tracking-eyebrow text-cream/85">
            {listing.city}, {listing.state}
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight text-cream sm:text-4xl">
            {listing.address}
          </h1>
          {price ? <p className="mt-2 font-serif text-2xl text-cream/95">{price}</p> : null}
          {community ? <p className="mt-2 text-cream/85 text-xs">In {community.name}</p> : null}
          <a
            href={listingFullUrl(agent.slug, listing.slug)}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-cream px-5 py-2 text-ink text-xs tracking-wide transition hover:bg-surface"
          >
            View full listing →
          </a>
          <p className="mt-3 text-[10px] text-cream/70">
            Listed by{' '}
            <a
              href={agentFullUrl(agent.slug)}
              className="underline decoration-cream/50 underline-offset-2 hover:text-cream"
            >
              {agent.name}
            </a>
          </p>
        </div>
      </article>
    </main>
  );
}
