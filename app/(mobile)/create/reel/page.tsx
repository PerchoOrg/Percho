/**
 * Mobile Create Reel wizard — step 1 (source picker).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.8
 *
 * C6.1 scope: **UI shell + source picker only**. Step-2 (caption / tags /
 * music) ships in C6.2; final render trigger + upload wiring lands after
 * the wizard shape is signed off.
 *
 * The screenshot (`docs/design/reelestate-teardown/screenshots/07-create-reel.png`)
 * shows a fixed header row (`Create` title + `Reel | Property` sub-tabs) and
 * a 2-step tracker. This route implements that chrome inline — no shared
 * `<CreateHeader>` yet, since C6.3 introduces the Property variant and
 * factoring it out early would speculate on the split shape (CLAUDE.md
 * §0.2 simplicity-first).
 *
 * Chrome (BottomNav / DesktopSidebar / TopBar) hides on this route via the
 * `/create/` prefix in `isChromeHidden` — the mobile layout owns its own
 * chrome, matching every other route under `app/(mobile)/`.
 */
import Link from 'next/link';
import { Video, Home } from 'lucide-react';
import { CreateReelSourcePicker } from '@/components/reelestate/CreateReelSourcePicker';

export default function CreateReelPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <header className="flex flex-col gap-4 px-4 pb-4 pt-6">
        <h1 className="text-center text-[22px] font-semibold tracking-tighter text-cyan">
          Create
        </h1>
        <nav aria-label="Create type" className="flex items-center justify-center gap-8">
          <SubTab href="/create/reel" active icon={<Video className="h-4 w-4" strokeWidth={2} />}>
            Reel
          </SubTab>
          <SubTab
            href="/create/property"
            active={false}
            icon={<Home className="h-4 w-4" strokeWidth={2} />}
          >
            Property
          </SubTab>
        </nav>
        <StepTracker current={1} total={2} />
      </header>
      <CreateReelSourcePicker />
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
                className={
                  'h-px w-8 ' + (done ? 'bg-cyan/50' : 'bg-white/15')
                }
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
