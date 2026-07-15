/**
 * Mobile Create Reel wizard — step 2 (caption + tags + music placeholder).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.8
 *
 * C6.2 scope: **step-2 form UI only**. The Publish button is rendered as a
 * disabled affordance until caption has content, then enabled but
 * non-functional — render trigger + upload wiring lands after the wizard
 * shape is signed off, per the same treatment used for step-1 Next in C6.1.
 *
 * The `source` query param comes from step-1's Next link
 * (`/create/reel/step-2?source=listing-photos|custom-upload`). Step 2 is
 * source-agnostic in the reelestate reference (§2.8 screenshot 08) — the
 * caption / tags / music panel is identical regardless of which path
 * produced the raw clip. So this page just reads the param and forwards it
 * to the form for the eventual back-link, no branching yet.
 *
 * Header chrome (Create title, Reel|Property sub-tabs, step tracker) is
 * duplicated inline here rather than shared with step-1. CLAUDE.md §0.2
 * simplicity-first: the C6.3 Property variant may diverge, and factoring a
 * two-call-site header would speculate on the split shape.
 *
 * Chrome hide (BottomNav / TopBar / DesktopSidebar) is already handled by
 * the `/create/` prefix in `isChromeHidden` — inherited from C6.1.
 */
import Link from 'next/link';
import { ChevronLeft, Video, Home } from 'lucide-react';
import { CreateReelStep2Form } from '@/components/reelestate/CreateReelStep2Form';

type Source = 'listing-photos' | 'custom-upload';

interface PageProps {
  searchParams: Promise<{ source?: string }>;
}

export default async function CreateReelStep2Page({ searchParams }: PageProps) {
  const { source: raw } = await searchParams;
  const source: Source | null =
    raw === 'listing-photos' || raw === 'custom-upload' ? raw : null;

  const backHref = source
    ? `/create/reel?source=${source}`
    : '/create/reel';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <header className="flex flex-col gap-4 px-4 pb-4 pt-6">
        <div className="relative flex items-center justify-center">
          <Link
            href={backHref}
            aria-label="Back to step 1"
            className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </Link>
          <h1 className="text-center text-[22px] font-semibold tracking-tighter text-cyan">
            Create
          </h1>
        </div>
        <nav aria-label="Create type" className="flex items-center justify-center gap-8">
          <SubTab active icon={<Video className="h-4 w-4" strokeWidth={2} />}>
            Reel
          </SubTab>
          <SubTab active={false} icon={<Home className="h-4 w-4" strokeWidth={2} />}>
            Property
          </SubTab>
        </nav>
        <StepTracker current={2} total={2} />
      </header>
      <CreateReelStep2Form />
    </div>
  );
}

function SubTab({
  active,
  icon,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        'relative flex items-center gap-1.5 pb-2 text-[14px] font-semibold ' +
        (active ? 'text-cyan' : 'text-white/50')
      }
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {children}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-cyan shadow-glow-cyan"
        />
      ) : null}
    </span>
  );
}

function StepTracker({ current, total }: { current: number; total: number }) {
  return (
    <ol
      aria-label={`Step ${current} of ${total}`}
      className="flex items-center justify-center gap-2 pt-1"
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => {
        const done = step < current;
        const active = step === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                'flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold ' +
                (active
                  ? 'border-cyan bg-cyan text-cyan-ink shadow-glow-cyan'
                  : done
                    ? 'border-cyan/50 bg-cyan/10 text-cyan'
                    : 'border-white/15 text-white/40')
              }
              aria-current={active ? 'step' : undefined}
            >
              {step}
            </span>
            {step < total ? (
              <span
                aria-hidden
                className={'h-px w-8 ' + (done ? 'bg-cyan/50' : 'bg-white/15')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
