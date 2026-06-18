import { SiteFooter } from '@/components/site/SiteFooter';
import {
  HOW_IT_WORKS,
  LANDING_HERO_POSTER,
  LANDING_HERO_VIDEO,
  LANDING_SUBTITLE,
  LANDING_TAGLINE,
} from '@/lib/copy/landing';
import { createClient } from '@/lib/supabase/server';
import { Heart, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

// Icon mapping kept in the page (the copy module shouldn't import lucide).
const HOW_IT_WORKS_ICONS = {
  'Agent uploads': Upload,
  'Platform enriches': Sparkles,
  'Buyer feels at home': Heart,
} as const;

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
      {/* Hero — full-bleed video, soft cream wash over, centered headline + dual CTA.
          Phase 38: Aman direction — text rendered in ink-on-cream within a centered
          card so it stays legible regardless of underlying video, and chrome stays
          warm/light per the no-dark-theme rule. */}
      <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-bg">
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={LANDING_HERO_POSTER}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={LANDING_HERO_VIDEO} type="video/mp4" />
        </video>
        {/* Cream wash — top fully translucent so video shows; bottom fades to bg
            so the text panel reads on cream. */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/40 to-bg" />

        <div className="relative z-10 flex h-full flex-col items-center justify-end px-6 pb-20 text-center md:pb-28">
          <div className="eyebrow mb-6">Vicinity</div>
          <h1 className="display-xl max-w-4xl text-ink">{LANDING_TAGLINE}</h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-ink2 leading-[1.7] sm:text-lg">
            {LANDING_SUBTITLE}
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/browse"
              className="inline-flex items-center justify-center bg-ink px-8 py-4 text-[12px] tracking-[0.22em] text-surface uppercase transition hover:bg-[#1f1f1f]"
            >
              Explore Listings
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center border border-line-strong px-8 py-4 text-[12px] tracking-[0.22em] text-ink uppercase transition hover:border-ink"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* How it works — 3 cards, hairline framed, generous whitespace. */}
      <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="mb-16 text-center">
          <div className="eyebrow mb-4">How it works</div>
          <h2 className="display-md">A quieter way to find a home</h2>
        </div>
        <div className="grid gap-12 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => {
            const Icon = HOW_IT_WORKS_ICONS[step.title];
            return (
              <div key={step.title} className="border-line border-t pt-8">
                <div className="eyebrow mb-6">No. {String(i + 1).padStart(2, '0')}</div>
                <Icon size={22} className="mb-5 text-ink" strokeWidth={1.25} />
                <div className="font-serif text-2xl text-ink leading-tight tracking-[-0.012em]">
                  {step.title}
                </div>
                <div className="mt-4 text-ink2 text-sm leading-[1.7]">{step.body}</div>
              </div>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
