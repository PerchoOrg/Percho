import { SiteFooter } from '@/components/site/SiteFooter';
import {
  HOW_IT_WORKS,
  LANDING_HERO_POSTER,
  LANDING_HERO_VIDEO,
  LANDING_SUBTITLE,
  LANDING_TAGLINE,
} from '@/lib/copy/landing';
import { ArrowRight, Heart, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';

// Icon mapping kept in the page (the copy module shouldn't import lucide).
const HOW_IT_WORKS_ICONS = {
  'Agent uploads': Upload,
  'Platform enriches': Sparkles,
  'Buyer feels at home': Heart,
} as const;

export default async function HomePage() {
  return (
    <>
      {/* Hero — full-bleed video with dark gradient over, centered headline + dual CTA */}
      <section className="relative h-[100svh] min-h-[640px] w-full overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/30 to-ink" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 text-[10px] uppercase tracking-[0.4em] text-gold sm:text-xs">
            Vicinity
          </div>
          <h1 className="font-serif text-5xl leading-[1.05] text-cream sm:text-7xl md:text-8xl">
            {LANDING_TAGLINE}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-cream/70 sm:text-lg">
            {LANDING_SUBTITLE}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/browse"
              className="btn-gold inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5"
            >
              Explore Listings <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="btn-ghost inline-flex items-center justify-center rounded-full px-7 py-3.5"
            >
              Agent Login
            </Link>
          </div>
          <div className="absolute bottom-8 animate-bounce text-xs uppercase tracking-widest text-cream/50">
            ↓ scroll
          </div>
        </div>
      </section>

      {/* How it works — 3 cards on a centered max-w container */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-14 text-center">
          <div className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">How it works</div>
          <div className="gold-line mx-auto max-w-[80px]" />
        </div>
        <div className="grid gap-10 md:grid-cols-3">
          {HOW_IT_WORKS.map((step) => {
            const Icon = HOW_IT_WORKS_ICONS[step.title];
            return (
              <div
                key={step.title}
                className="rounded-2xl border border-white/5 bg-ink2/60 p-7 transition hover:border-gold/30"
              >
                <Icon size={28} className="mb-5 text-gold" />
                <div className="mb-2 font-serif text-2xl text-cream">{step.title}</div>
                <div className="text-sm leading-relaxed text-cream/60">{step.body}</div>
              </div>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
