/**
 * <CreatePropertyWizardHeader> — shared header chrome for the Create Property
 * wizard **stub steps 2-5** (`/create/property/step-2..5`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.4 scope: extracted specifically for the 4 stub step pages. The step-1
 * entry (`/create/property`) keeps its inline header per CLAUDE.md §0.3
 * (don't refactor adjacent code) — 4 new call sites for identical chrome hits
 * the rule-of-three threshold on its own.
 *
 * Shape mirrors step-1's inline header (Create title + Reel|Property sub-tabs
 * with cyan underline+glow on Property + 5-step tracker), plus a back chevron
 * to the previous step at the top-left. Property sub-tab is always active in
 * this wizard.
 */
import Link from 'next/link';
import { ChevronLeft, Video, Home } from 'lucide-react';

export function CreatePropertyWizardHeader({
  current,
  backHref,
}: {
  current: 2 | 3 | 4 | 5;
  backHref: string;
}) {
  return (
    <header className="flex flex-col gap-4 px-4 pb-4 pt-6">
      <div className="relative flex items-center justify-center">
        <Link
          href={backHref}
          aria-label="Back"
          className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border border-bg-border bg-bg-surface text-white/70 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </Link>
        <h1 className="text-center text-[22px] font-semibold tracking-tighter text-cyan">
          Create
        </h1>
      </div>
      <nav aria-label="Create type" className="flex items-center justify-center gap-8">
        <SubTab href="/create/reel" active={false} icon={<Video className="h-4 w-4" strokeWidth={2} />}>
          Reel
        </SubTab>
        <SubTab
          href="/create/property"
          active
          icon={<Home className="h-4 w-4" strokeWidth={2} />}
        >
          Property
        </SubTab>
      </nav>
      <StepTracker current={current} total={5} />
    </header>
  );
}

function SubTab({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'relative flex items-center gap-1.5 pb-2 text-[14px] font-semibold ' +
        (active ? 'text-cyan' : 'text-white/50 hover:text-white/70')
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
    </Link>
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
