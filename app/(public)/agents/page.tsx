import type { Metadata } from 'next';
import { MapPin, Users, Video } from 'lucide-react';
import { WaitlistForm } from './_components/WaitlistForm';

export const metadata: Metadata = {
  title: 'Percho for Agents — Video-first home discovery for Atlanta',
  description:
    'Join the Atlanta beta. Enter an address, upload one video, reach real Atlanta home-buyers. Free, non-exclusive, 100% of leads are yours.',
};

/**
 * /agents — public agent-waitlist landing page.
 *
 * Built for the KW Atlanta meetup (2026-07). Agents scan a QR code on the
 * table sign, land here on their phone, and drop email + phone. Copy is
 * verbatim from docs/meetup-kw-atlanta/landing-page-copy.md.
 */
export default function AgentsLandingPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pt-14 pb-10 sm:pt-20">
        <p className="text-xs uppercase tracking-eyebrow text-muted">Percho for Agents</p>
        <h1 className="mt-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Your listings deserve better than a photo grid.
        </h1>
        <p className="mt-5 text-base text-ink2 sm:text-lg">
          Percho is a video-first, swipe-based feed for Atlanta home-buyers. Enter the address,
          upload one video, and we deliver it to buyers who match. Free during beta. 100% of leads
          are yours.
        </p>

        <a
          href="#waitlist"
          className="btn-gold mt-8 inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-base font-medium sm:w-auto"
        >
          Join the Atlanta beta →
        </a>

        <p className="mt-3 text-sm text-muted">
          Curious first?{' '}
          <a href="/demo/autofill" className="text-ink2 underline hover:text-ink">
            See a demo →
          </a>
        </p>

        <p className="mt-4 text-sm text-muted">
          Not an agent?{' '}
          <a href="/browse" className="text-ink underline hover:text-ink/80">
            Browse Atlanta homes →
          </a>
        </p>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <BenefitCard
            icon={<MapPin className="h-6 w-6" aria-hidden="true" />}
            title="Zero data entry"
            body="Enter the address. FMLS auto-fills price, beds, baths, sqft, MLS #, and photos. You add one video. That's the whole workflow."
          />
          <BenefitCard
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            title="Every lead is yours"
            body='No lead resale. No premier-agent auction. When a buyer taps "contact agent," it comes straight to your inbox and dashboard.'
          />
          <BenefitCard
            icon={<Video className="h-6 w-6" aria-hidden="true" />}
            title="Your face, front and center"
            body="Every listing shows your name, photo, license, and brokerage. Buyers know who they're touring with before they tap."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="font-serif text-2xl text-ink sm:text-3xl">How it works</h2>
        <ol className="mt-6 space-y-4">
          <Step n={1} title="Enter the address" />
          <Step n={2} title="We auto-fill from FMLS" />
          <Step n={3} title="You upload one video — Atlanta buyers swipe, tap, and reach out." />
        </ol>
      </section>

      {/* Trust strip + waitlist form */}
      <section id="waitlist" className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-center text-xs text-muted">
          FMLS data via Bridge Interactive · IDX-compliant · Non-exclusive · No credit card
        </p>

        <div className="mt-6">
          <h2 className="font-serif text-2xl text-ink sm:text-3xl">Join the Atlanta beta</h2>
          <p className="mt-2 text-sm text-ink2">
            We verify your license and FMLS membership, then send you a dashboard invite. Usually
            1–2 business days.
          </p>
        </div>

        <div className="mt-6">
          <WaitlistForm />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="font-serif text-2xl text-ink">FAQ</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          <Faq
            q="Is this free?"
            a="Yes — free during beta. Beta agents get grandfathered pricing when we introduce paid tiers."
          />
          <Faq
            q="Do I need to pull my listings from Zillow?"
            a="No. Percho is non-exclusive."
          />
          <Faq q="Where does the data come from?" a="FMLS, via Bridge Interactive." />
          <Faq q="What markets?" a="Atlanta metro only right now." />
          <Faq q="Who owns the video I upload?" a="You do." />
        </div>
      </section>

      {/* Footer CTA */}
      <section className="mx-auto max-w-3xl px-5 py-12 text-center">
        <p className="text-base text-ink2">
          <span className="text-ink">Still thinking?</span> Email the founder directly:{' '}
          <a href="mailto:founder@vicinities.cc" className="text-ink underline hover:text-ink/80">
            founder@vicinities.cc
          </a>
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 text-sm text-ink2 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Percho</p>
          <nav className="flex gap-5">
            <a href="/privacy" className="hover:text-ink">
              Privacy
            </a>
            <a href="/terms" className="hover:text-ink">
              Terms
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink/5 text-ink">
        {icon}
      </div>
      <h3 className="mt-4 font-serif text-lg text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink2">{body}</p>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface p-4">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-sm font-medium text-cream">
        {n}
      </span>
      <span className="text-sm text-ink sm:text-base">{title}</span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group p-5">
      <summary className="cursor-pointer list-none text-sm font-medium text-ink group-open:mb-2">
        {q}
      </summary>
      <p className="text-sm text-ink2">{a}</p>
    </details>
  );
}
