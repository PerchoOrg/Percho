'use client';

/**
 * <CreateReelSourcePicker> — step-1 UI for the mobile Create Reel wizard
 * (`/create/reel`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.8
 *
 * C6.1 scope: **source picker only, no upload logic**. The wizard flow
 * (step 2 caption+tags+music, step 3 render trigger) ships in later ticks
 * (C6.2+).
 *
 * Percho substitution (README §2.8 "Percho notes"): reelestate's step 1 is
 * "Choose Property" — a manual property carousel because reelestate has a
 * cold-start problem. Percho generates reels from existing listing photos
 * automatically, so step 1 is a source picker between two paths:
 *
 *   1. `listing-photos` — Auto-generate from an existing listing's photos.
 *      This is the batch photo→video pipeline that already exists on the
 *      render worker side. Default / recommended option — cyan glow.
 *   2. `custom-upload` — Upload a custom video from device library. Manual
 *      escape hatch for agents who filmed something themselves.
 *
 * Selection state is local (`useState`) because the next-step navigation
 * ships in C6.2 (it will read `source` from a query param or a wizard
 * context). This component intentionally does NOT wire the Next button —
 * that's C6.2's job. The Next pill is rendered here (per README §2.8
 * "Bottom CTA: full-width Next > gradient pill") as a **disabled affordance
 * until a source is picked**, then enabled and non-functional — same
 * treatment we've used for other pre-wired-later CTAs in this rewrite
 * (Message pill in AgentContactCTAs pointed at `/messages/new` before that
 * route existed; the disabled-vs-enabled state itself is the UI signal, and
 * the click target is the placeholder awaiting C6.2).
 *
 * No mock data: this component reads no rows. When the user picks
 * "listing-photos", C6.2 will fetch that agent's real listings from
 * Supabase and show them as the next-step chooser.
 */
import { useState } from 'react';
import { ChevronRight, Images, Upload } from 'lucide-react';

type Source = 'listing-photos' | 'custom-upload';

export function CreateReelSourcePicker() {
  const [source, setSource] = useState<Source | null>(null);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <SourceCard
        active={source === 'listing-photos'}
        onSelect={() => setSource('listing-photos')}
        icon={<Images className="h-5 w-5" strokeWidth={2} />}
        eyebrow="Recommended"
        title="Auto-generate from listing photos"
        subtitle="Pick one of your listings — Percho stitches the photos into a reel."
      />
      <SourceCard
        active={source === 'custom-upload'}
        onSelect={() => setSource('custom-upload')}
        icon={<Upload className="h-5 w-5" strokeWidth={2} />}
        title="Upload a custom video"
        subtitle="Use a walkthrough you already filmed. MP4 / MOV, up to 2 GB."
      />

      <button
        type="button"
        disabled={source === null}
        className="mt-2 inline-flex h-12 w-full items-center justify-center gap-1 rounded-full bg-grad-cta text-[15px] font-semibold text-cyan-ink shadow-glow-cyan transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-bg-elevated disabled:text-white/30 disabled:shadow-none"
        aria-label="Continue to step 2"
      >
        Next
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

interface SourceCardProps {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle: string;
}

function SourceCard({ active, onSelect, icon, eyebrow, title, subtitle }: SourceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={
        'group flex w-full items-start gap-3 rounded-card border p-4 text-left transition ' +
        (active
          ? 'border-cyan/60 bg-bg-elevated shadow-glow-cyan'
          : 'border-bg-border bg-bg-surface hover:border-white/20')
      }
    >
      <span
        className={
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-tile ' +
          (active ? 'bg-cyan text-cyan-ink' : 'bg-bg-elevated text-white/70')
        }
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {eyebrow ? (
          <span className="text-[10px] font-semibold uppercase tracking-chip text-cyan">
            {eyebrow}
          </span>
        ) : null}
        <span className="text-[15px] font-semibold leading-tight text-white">{title}</span>
        <span className="text-[13px] leading-snug text-white/60">{subtitle}</span>
      </span>
    </button>
  );
}
