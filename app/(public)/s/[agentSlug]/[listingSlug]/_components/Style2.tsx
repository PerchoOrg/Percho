/**
 * Style 2 — Cinematic Story.
 *
 * Scroll-snap full-viewport sections, IG-story pacing — one piece of info
 * per screen. Hero video → price → beds/baths → community → CTA. Each
 * section is its own self-contained "frame" so a screenshot of any single
 * section reads cleanly.
 *
 * Mobile-first; on larger screens sections still fill the viewport but
 * with wider type so it reads like a film title sequence.
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

export function Style2Cinematic({
  data,
  communitySlug,
}: {
  data: ShowcaseData;
  communitySlug: string | null;
}) {
  const { bundle, heroImage, heroVideo, communityImage } = data;
  const { listing, agent, community } = bundle;
  const price = formatPrice(listing.price);
  const specs = formatSpecs(listing.beds, listing.baths, listing.sqft);
  const blurb = communityBlurb(community?.description ?? null);

  // All scrim children sit over an image — every overlay text uses
  // text-cream + an explicit dark gradient mask. See luxury-redesign-playbook
  // §7e: any absolute text child over an <img> needs a verified-contrast scrim.
  const scrim =
    'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40';

  return (
    <main className="h-screen snap-y snap-mandatory overflow-y-scroll bg-bg text-ink">
      {/* Frame 1 — Hero */}
      <section className="relative h-screen w-full snap-start snap-always overflow-hidden">
        {heroVideo ? (
          <video
            src={heroVideo}
            poster={heroImage}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <track kind="captions" />
          </video>
        ) : (
          // biome-ignore lint/nursery/noImgElement: external CDN
          <img
            src={heroImage}
            alt={listing.address}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className={scrim} />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-12 sm:px-10">
          <p className="text-[11px] uppercase tracking-eyebrow text-cream/80">
            {listing.city}, {listing.state}
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-cream sm:text-6xl">
            {listing.address}
          </h1>
        </div>
      </section>

      {/* Frame 2 — Price */}
      {price ? (
        <section className="relative flex h-screen w-full snap-start snap-always items-center justify-center bg-bg px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-eyebrow text-ink2">Listed at</p>
            <p className="mt-4 font-serif text-6xl leading-none tracking-tighter text-ink sm:text-8xl">
              {price}
            </p>
          </div>
        </section>
      ) : null}

      {/* Frame 3 — Specs */}
      {specs.length > 0 ? (
        <section className="relative flex h-screen w-full snap-start snap-always items-center justify-center bg-surface px-6">
          <dl className="grid w-full max-w-md grid-cols-1 gap-10 text-center">
            {specs.map((s) => (
              <div key={s.label}>
                <dt className="text-[11px] uppercase tracking-eyebrow text-ink2">{s.label}</dt>
                <dd className="mt-2 font-serif text-5xl text-ink sm:text-6xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {/* Frame 4 — Community */}
      {community ? (
        <section className="relative h-screen w-full snap-start snap-always overflow-hidden">
          {communityImage ? (
            // biome-ignore lint/nursery/noImgElement: external CDN
            <img
              src={communityImage}
              alt={community.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-bg" />
          )}
          {communityImage ? <div className={scrim} /> : null}
          <div className="absolute inset-x-0 bottom-0 px-6 pb-12 sm:px-10">
            <p
              className={`text-[11px] uppercase tracking-eyebrow ${
                communityImage ? 'text-cream/80' : 'text-ink2'
              }`}
            >
              The neighborhood
            </p>
            <h2
              className={`mt-2 font-serif text-3xl sm:text-5xl ${
                communityImage ? 'text-cream' : 'text-ink'
              }`}
            >
              {community.name}
            </h2>
            {blurb ? (
              <p
                className={`mt-3 max-w-md text-base leading-relaxed ${
                  communityImage ? 'text-cream/90' : 'text-ink2'
                }`}
              >
                {blurb}
              </p>
            ) : null}
            {communitySlug ? (
              <a
                href={communityFullUrl(communitySlug)}
                className={`mt-4 inline-block underline underline-offset-4 ${
                  communityImage
                    ? 'text-cream decoration-cream/70'
                    : 'text-ink decoration-line-strong'
                }`}
              >
                View community details →
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Frame 5 — CTA */}
      <section className="relative flex h-screen w-full snap-start snap-always flex-col items-center justify-center bg-ink px-6 text-center text-cream">
        <p className="text-[11px] uppercase tracking-eyebrow text-cream/70">{listing.address}</p>
        <p className="mt-4 max-w-md font-serif text-3xl leading-snug text-cream sm:text-4xl">
          See the full story.
        </p>
        <a
          href={listingFullUrl(agent.slug, listing.slug)}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-cream px-7 py-3 text-ink text-sm tracking-wide transition hover:bg-surface"
        >
          View full listing →
        </a>
        <a
          href={agentFullUrl(agent.slug)}
          className="mt-6 text-cream/80 text-xs underline decoration-cream/40 underline-offset-4 hover:text-cream"
        >
          Contact {agent.name}
        </a>
      </section>
    </main>
  );
}
