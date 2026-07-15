/**
 * <CreatePropertyStepStub> — "coming soon" body for stubbed steps 2-5 of the
 * mobile Create Property wizard (`/create/property/step-2..5`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: **stub only**. The four step pages ship as skeleton screens
 * per the C6.4 plan directive ("skeleton, 'coming soon' if not designed").
 * Real form fields land after the wizard shape is signed off with the owner
 * (CLAUDE.md §8: schema/data-model calls belong to owner).
 *
 * Layout mirrors the reelestate wizard idle-state shape (title + subtitle +
 * dashed empty-state card + inert continue pill). The continue pill renders
 * as a `<Link>` to the next step so the wizard is navigable end-to-end for
 * design review, but no state is persisted between steps.
 */
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function CreatePropertyStepStub({
  title,
  subtitle,
  nextHref,
  nextLabel,
}: {
  title: string;
  subtitle: string;
  nextHref: string;
  nextLabel: string;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold leading-tight text-white">
          {title}
        </h2>
        <p className="text-[13px] leading-snug text-white/60">{subtitle}</p>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-card border border-dashed border-white/15 bg-bg-surface/60 px-4 py-10 text-center"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-tile bg-cyan/10 text-cyan">
          <Sparkles className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="text-[13px] font-semibold text-white/80">
          Coming soon
        </span>
        <span className="max-w-[240px] text-[12px] leading-snug text-white/50">
          This step is still being designed. Skip ahead to preview the flow.
        </span>
      </div>

      <Link
        href={nextHref}
        className="flex items-center justify-center rounded-full bg-grad-cta px-4 py-3 text-[14px] font-semibold text-cyan-ink shadow-glow-cyan transition hover:brightness-110"
      >
        {nextLabel}
      </Link>
    </div>
  );
}
