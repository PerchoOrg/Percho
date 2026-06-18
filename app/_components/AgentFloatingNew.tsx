'use client';

/**
 * AgentFloatingNew — agent-only floating "+" button on the bottom-right.
 *
 * Phase 36 (2026-06-18). Replaces the agent center-FAB in the old
 * <BottomNav>. After unifying IA so agents and buyers share the same primary
 * nav (Explore as the center FAB for both), the "+ New listing" flow needed
 * a new home that doesn't fight for a nav slot.
 *
 * Behavior:
 *   - Renders only on routes where creation makes sense: Dashboard, Listings
 *     management, Communities (agent's content surfaces), and Profile.
 *   - Hidden on consumption surfaces (Explore, Saved, Community feed) so the
 *     button doesn't intrude on the buyer-shaped view that agents share with
 *     buyers.
 *   - Hidden on desktop (md+) — desktop uses the <NewDropdown> in <SiteHeader>.
 *   - Tap opens a slide-up action sheet identical to the old agent FAB:
 *     "List a Property" / "Add Community Video" → community picker.
 *
 * Mounted in the root layout via <AgentFloatingNewWrapper>, which resolves
 * the role and pre-fetches the community picker list.
 */

import { Building2, Plus, Video, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isChromeHidden } from './nav-config';

export type CommunityChoice = {
  id: string;
  name: string;
  city: string | null;
  state: string;
};

/**
 * Routes where the agent floating "+" surfaces. Keep this conservative: the
 * button is for content-creation context, not for buyer-shaped browsing.
 */
const SHOW_PREFIXES = [
  '/dashboard',
  '/profile',
  '/communities', // agent may add a community video while exploring the grid
];

function shouldShow(pathname: string): boolean {
  if (isChromeHidden(pathname)) return false;
  return SHOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AgentFloatingNew({ communities }: { communities: CommunityChoice[] }) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);

  if (!shouldShow(pathname)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create new"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-gold/30 shadow-lg transition active:scale-95 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
      >
        <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <ActionSheet open={open} onClose={() => setOpen(false)} communities={communities} />
    </>
  );
}

function ActionSheet({
  open,
  onClose,
  communities,
}: {
  open: boolean;
  onClose: () => void;
  communities: CommunityChoice[];
}) {
  const [step, setStep] = useState<'root' | 'pick'>('root');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'pick') setStep('root');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  useEffect(() => {
    if (!open) setStep('root');
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:hidden"
      // biome-ignore lint/a11y/useSemanticElements: <dialog> requires imperative showModal()/close() and conflicts with our slide-up animation.
      role="dialog"
      aria-modal="true"
      aria-label="Create new"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-2xl border-cream/10 border-t bg-ink p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        style={{ animation: 'slideUp 180ms ease-out' }}
      >
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-cream/60 hover:text-cream"
          >
            <X size={20} />
          </button>
        </div>
        <ul className="space-y-2">
          {step === 'root' ? (
            <>
              <li>
                <Link
                  href="/dashboard/listings/new"
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl border-cream/10 border bg-ink/60 px-4 py-3 transition hover:border-gold/40 hover:bg-gold/5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Building2 size={18} />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium text-cream text-sm">List a Property</span>
                    <span className="text-cream/60 text-xs">Add a home to your portfolio</span>
                  </span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  className="flex w-full items-center gap-3 rounded-xl border-cream/10 border bg-ink/60 px-4 py-3 text-left transition hover:border-gold/40 hover:bg-gold/5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Video size={18} />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium text-cream text-sm">Add Community Video</span>
                    <span className="text-cream/60 text-xs">
                      Show buyers what a community really feels like
                    </span>
                  </span>
                </button>
              </li>
            </>
          ) : (
            <>
              <li className="px-1 text-cream/60 text-xs">Pick a community to add a video to:</li>
              {communities.length === 0 ? (
                <li>
                  <Link
                    href="/dashboard/communities/new"
                    onClick={onClose}
                    className="block rounded-xl border-cream/10 border bg-ink/60 px-4 py-3 text-cream/80 text-sm hover:border-gold/40"
                  >
                    No communities yet — create one →
                  </Link>
                </li>
              ) : (
                <>
                  <li className="max-h-[50vh] overflow-y-auto">
                    <ul className="space-y-1">
                      {communities.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/dashboard/communities/${c.id}/upload`}
                            onClick={onClose}
                            className="flex items-baseline justify-between gap-3 rounded-lg border-cream/5 border bg-ink/40 px-3 py-2 hover:border-gold/40 hover:bg-gold/5"
                          >
                            <span className="truncate font-medium text-cream text-sm">{c.name}</span>
                            <span className="shrink-0 text-cream/50 text-[11px]">
                              {c.city ? `${c.city}, ${c.state}` : c.state}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                  <li className="flex gap-2 pt-1">
                    <Link
                      href="/dashboard/communities/new"
                      onClick={onClose}
                      className="flex-1 rounded-lg border-cream/10 border bg-ink/40 px-3 py-2 text-center text-cream/80 text-xs hover:border-gold/40"
                    >
                      + New community
                    </Link>
                    <Link
                      href="/dashboard/communities"
                      onClick={onClose}
                      className="flex-1 rounded-lg border-cream/10 border bg-ink/40 px-3 py-2 text-center text-cream/80 text-xs hover:border-gold/40"
                    >
                      Browse all
                    </Link>
                  </li>
                </>
              )}
            </>
          )}
        </ul>
        <button
          type="button"
          onClick={() => (step === 'pick' ? setStep('root') : onClose())}
          className="mt-3 w-full rounded-xl border-cream/10 border bg-transparent px-4 py-3 text-cream/70 text-sm hover:text-cream"
        >
          {step === 'pick' ? '← Back' : 'Cancel'}
        </button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
