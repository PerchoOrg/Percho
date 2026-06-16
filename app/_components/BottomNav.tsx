'use client';

/**
 * BottomNav — mobile-only fixed bottom tab bar.
 *
 * 5-slot layout, role-aware middle slot:
 *   - anon / buyer  → Community · Nearby · ▶ Explore (FAB) · Saved · Me
 *   - agent         → Dashboard · Community · ⊕ New (FAB) · Leads · Me
 *
 * Both roles get a raised gold FAB in the middle slot:
 *   - Buyer: Explore — direct link to /browse (swipe feed entry).
 *   - Agent: + New — opens an action sheet (List a Property / Community Video).
 *
 * Phase 19 (2026-06-13): introduced 5-slot mobile nav.
 * Phase 26 (2026-06-14): tab definitions moved to `nav-config.ts` so the
 * desktop <SiteHeader> uses the exact same set without drift.
 * Phase 27 (2026-06-16): dropped "Home" tab. Buyer middle slot is now an
 * emphasized Explore FAB (centerEmphasis flag in nav-config). Community
 * promoted to leftmost slot for both roles.
 *
 * Hides itself on:
 *   - `md:` and up (desktop uses SiteHeader)
 *   - feed routes (`/v/...`, `/browse/feed`) — immersive
 *   - auth routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
 *   - landing (`/`)
 */

import { Building2, Plus, Video, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AGENT_LEFT_TABS,
  AGENT_RIGHT_TABS,
  BUYER_TABS,
  isChromeHidden,
  isTabActive,
  type Tab,
  type ViewerRole,
} from './nav-config';

export type { ViewerRole } from './nav-config';

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
        active ? 'text-gold' : 'text-cream/65 hover:text-cream'
      }`}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="leading-none">{tab.label}</span>
    </Link>
  );
}

function FabActionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
            className="rounded-full p-1 text-cream/60 hover:text-cream"
          >
            <X size={20} />
          </button>
        </div>
        <ul className="space-y-2">
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
            <Link
              href="/dashboard/communities"
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl border-cream/10 border bg-ink/60 px-4 py-3 transition hover:border-gold/40 hover:bg-gold/5"
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
            </Link>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border-cream/10 border bg-transparent px-4 py-3 text-cream/70 text-sm hover:text-cream"
        >
          Cancel
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

export function BottomNav({ role }: { role: ViewerRole }) {
  const pathname = usePathname() ?? '/';
  const [fabOpen, setFabOpen] = useState(false);

  if (isChromeHidden(pathname)) return null;

  const isAgent = role === 'agent';

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-cream/10 border-t bg-ink/90 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
          {isAgent ? (
            <>
              {AGENT_LEFT_TABS.map((tab) => (
                <li key={tab.href} className="flex-1">
                  <TabButton tab={tab} active={isTabActive(pathname, tab)} />
                </li>
              ))}
              <li className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={() => setFabOpen(true)}
                  aria-label="Create new"
                  aria-haspopup="dialog"
                  aria-expanded={fabOpen}
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-gold/20 shadow-lg transition active:scale-95"
                >
                  <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
              {AGENT_RIGHT_TABS.map((tab) => (
                <li key={tab.href} className="flex-1">
                  <TabButton tab={tab} active={isTabActive(pathname, tab)} />
                </li>
              ))}
            </>
          ) : (
            BUYER_TABS.map((tab) =>
              tab.centerEmphasis === true ? (
                <li key={tab.href} className="flex flex-1 items-center justify-center">
                  <Link
                    href={tab.href}
                    aria-label={tab.label}
                    aria-current={isTabActive(pathname, tab) ? 'page' : undefined}
                    className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-gold/20 shadow-lg transition active:scale-95"
                  >
                    <tab.icon size={24} strokeWidth={2.25} aria-hidden="true" />
                  </Link>
                </li>
              ) : (
                <li key={tab.href} className="flex-1">
                  <TabButton tab={tab} active={isTabActive(pathname, tab)} />
                </li>
              ),
            )
          )}
        </ul>
      </nav>
      {isAgent ? <FabActionSheet open={fabOpen} onClose={() => setFabOpen(false)} /> : null}
    </>
  );
}
