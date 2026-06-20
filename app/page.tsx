import { SiteFooter } from '@/components/site/SiteFooter';
import {
  LANDING_HERO_POSTER,
  LANDING_HERO_VIDEO,
  LANDING_SUBTITLE,
  LANDING_TAGLINE,
} from '@/lib/copy/landing';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  // If already authed, the landing's Login button is meaningless and Explore
  // should be the default — send them straight to /browse.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/browse');

  return (
    <>
      {/* Hero — full-bleed video, soft cream wash over, centered headline + dual CTA. */}
      <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-bg">
        <video
          autoPlay
          muted
          loop
          playsInline
          // WeChat X5 inline-autoplay hints — without these, X5 swaps the video
          // for a system play button and the hero appears static (poster only).
          webkit-playsinline="true"
          x5-playsinline="true"
          x5-video-player-type="h5-page"
          x5-video-player-fullscreen="false"
          poster={LANDING_HERO_POSTER}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={LANDING_HERO_VIDEO} type="video/mp4" />
        </video>
        {/* Bottom-only cream fade — narrow band so the video stays the
            actual background; needed for white H1 + gold eyebrow legibility.
            Wider wash washes out the dark Pexels footage and white text
            falls onto cream → unreadable. */}
        <div className="absolute inset-x-0 bottom-0 h-[25%] bg-gradient-to-b from-bg/0 via-bg/40 to-bg" />
        {/* Slight top-down dim so center text reads against any stray bright
            frames in the loop — kept very subtle (10%). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-transparent" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          {/* Brand eyebrow — centered above H1 per截图 idiom. Not a link;
              chrome routes use <BrandMark> for that. */}
          <div
            className="mb-6 font-medium uppercase"
            style={{
              color: '#c9a24a',
              letterSpacing: '0.32em',
              fontSize: '12px',
            }}
          >
            VICINITY
          </div>
          <h1 className="display-xl max-w-4xl text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)]">
            {LANDING_TAGLINE}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-[1.7] text-white/90 drop-shadow-[0_1px_12px_rgba(0,0,0,0.4)] sm:text-lg">
            {LANDING_SUBTITLE}
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/browse"
              className="inline-flex items-center justify-center rounded-full px-9 py-4 text-[12px] font-medium uppercase tracking-[0.22em] text-[#1a1410] transition hover:brightness-110"
              style={{ backgroundColor: '#c9a24a' }}
            >
              Explore
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/70 px-9 py-4 text-[12px] font-medium uppercase tracking-[0.22em] text-white transition hover:border-white hover:bg-white/10"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
