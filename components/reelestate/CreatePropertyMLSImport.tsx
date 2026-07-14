'use client';

/**
 * <CreatePropertyMLSImport> — step-1 UI for the mobile Create Property wizard
 * (`/create/property`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.9
 *
 * C6.3 scope: **MLS import card + manual entry link, no ingest logic**. The
 * wizard flow (steps 2-5) ships in C6.4 as stub screens; real MLS pull /
 * form persistence lands after the wizard shape is signed off.
 *
 * Layout mirrors reelestate screenshot 09 (Create Property step 1):
 *
 *   [ MLS Import — orange card, primary CTA ]
 *   —— or ——
 *   [ Enter manually — plain link ]
 *
 * The MLS Import card is the hero action, painted with an orange accent per
 * README §2.9 (reelestate uses a warm accent on this card specifically to
 * differentiate the "auto-fill" fast path from the manual escape hatch —
 * everywhere else the wizard uses the app's cyan).
 *
 * Both actions are non-functional in C6.3:
 *  - MLS Import → `/create/property/step-2?mode=mls` — placeholder href,
 *    step-2 stub lands in C6.4.
 *  - Enter manually → `/create/property/step-2?mode=manual` — same.
 *
 * Same disabled-vs-enabled treatment we used for step-1 Next in C6.1
 * (Create Reel) and the Message pill in AgentContactCTAs — the Link renders
 * the terminal target and C6.4 fills in the page. No mock data, no fetches.
 */
import Link from 'next/link';
import { ChevronRight, Database, Pencil } from 'lucide-react';

export function CreatePropertyMLSImport() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-8">
      <Link
        href="/create/property/step-2?mode=mls"
        aria-label="Import listing from MLS"
        className="group flex items-start gap-3 rounded-card border border-orange-400/60 bg-orange-500/10 p-4 text-left shadow-[0_0_24px_rgba(251,146,60,0.25)] transition hover:border-orange-300 hover:bg-orange-500/15"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-orange-500 text-white">
          <Database className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-chip text-orange-300">
            Fastest
          </span>
          <span className="text-[15px] font-semibold leading-tight text-white">
            Import from MLS
          </span>
          <span className="text-[13px] leading-snug text-white/70">
            Paste an MLS # or address — Percho auto-fills specs, photos, and
            description.
          </span>
        </span>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-orange-300"
          strokeWidth={2}
        />
      </Link>

      <div
        aria-hidden
        className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-chip text-white/40"
      >
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <Link
        href="/create/property/step-2?mode=manual"
        aria-label="Enter listing details manually"
        className="group flex items-center justify-center gap-2 rounded-full border border-bg-border bg-bg-surface px-4 py-3 text-[14px] font-medium text-white/80 transition hover:border-white/25 hover:text-white"
      >
        <Pencil className="h-4 w-4" strokeWidth={2} />
        Enter manually
      </Link>
    </div>
  );
}
