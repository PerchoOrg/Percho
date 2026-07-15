/**
 * Mobile Create Property wizard — step 1 (MLS import + manual entry).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.3 scope: **MLS import card + manual entry link only**. Steps 2-5 stub
 * screens ship in C6.4; real MLS ingest / form persistence lands after
 * wizard shape sign-off.
 *
 * Header chrome (Create title + Reel|Property sub-tabs + step tracker) is
 * duplicated inline here rather than shared with the Create Reel routes.
 * CLAUDE.md §0.2 simplicity-first — two call sites of the same shape are
 * cheaper than one abstraction that has to grow to cover both.
 *
 * Chrome (BottomNav / TopBar / DesktopSidebar) already hides on `/create/`
 * prefix via `isChromeHidden` — inherited from C6.1.
 */
import Link from 'next/link';
import { Video, Home } from 'lucide-react';
import { CreatePropertyMLSImport } from '@/components/reelestate/CreatePropertyMLSImport';

export default function CreatePropertyPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <header className="flex flex-col gap-4 px-4 pb-4 pt-6">
        <h1 className="text-center text-[22px] font-semibold tracking-tighter text-cyan">
          Create
        </h1>
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
        <StepTracker current={1} total={5} />
      </header>
      <CreatePropertyMLSImport />
    </div>
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
