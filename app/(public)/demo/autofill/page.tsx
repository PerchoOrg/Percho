import type { Metadata } from 'next';
import { AutofillDemo } from './_components/AutofillDemo';

export const metadata: Metadata = {
  title: 'Autofill demo — Percho',
  description:
    'Type an Atlanta address, watch price / beds / baths / sqft / photos populate. Demo with mock data — real FMLS integration behind the scenes.',
  robots: { index: false, follow: false },
};

/**
 * /demo/autofill — pitch-time demo for the KW Atlanta meetup (2026-07).
 *
 * Server component wrapper. All mock data lives client-side; this page
 * exists so the founder can demo the "type an address, we fill everything"
 * pitch without live Bridge/FMLS credentials.
 */
export default function AutofillDemoPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Demo banner */}
      <div className="bg-amber-100 text-amber-900 border-b border-amber-200">
        <div className="mx-auto max-w-3xl px-5 py-2 text-center text-xs font-semibold uppercase tracking-eyebrow">
          Demo — mock data
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-5 pt-10 pb-6 sm:pt-14">
        <a
          href="/agents"
          className="text-sm text-muted underline underline-offset-2 hover:text-ink2"
        >
          ← Back to Percho for Agents
        </a>
        <p className="mt-4 text-xs uppercase tracking-eyebrow text-muted">Percho autofill</p>
        <h1 className="mt-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">
          Type an address. We fill everything.
        </h1>
        <p className="mt-4 text-base text-ink2 sm:text-lg">
          Price, beds, baths, sqft, lot, year, MLS #, photos, description — pulled from FMLS in one
          call. You add the video.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-20">
        <AutofillDemo />
      </section>
    </div>
  );
}
