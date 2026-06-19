'use client';

/**
 * SharePosterButton — opens a modal with 3 showcase poster styles for the
 * listing. Each card has a "Copy link" + "Download poster" action. Used on
 * the listing edit page header (phase 39.6, expanded phase 40.1/40.6).
 */

import { useEffect, useState } from 'react';

interface Props {
  agentSlug: string;
  listingSlug: string;
}

const STYLES: { n: number; name: string; desc: string }[] = [
  { n: 1, name: 'Editorial Magazine', desc: 'Serif headlines, clean text-led layout.' },
  { n: 2, name: 'Cinematic Story', desc: 'Full-bleed photo, moody overlay copy.' },
  { n: 4, name: 'Luxury Brochure', desc: 'Warm tones, refined typography.' },
];

export function SharePosterButton({ agentSlug, listingSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (copiedStyle === null) return;
    const t = setTimeout(() => setCopiedStyle(null), 2000);
    return () => clearTimeout(t);
  }, [copiedStyle]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const urlFor = (n: number) => `${origin}/s/${agentSlug}/${listingSlug}?style=${n}`;

  const onCopy = async (n: number) => {
    try {
      await navigator.clipboard.writeText(urlFor(n));
      setCopiedStyle(n);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs text-ink2 transition hover:border-line-strong hover:text-ink"
      >
        Share as poster
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            // biome-ignore lint/a11y/useSemanticElements: native <dialog> needs imperative showModal/close API; this modal is fully controlled by React state
            role="dialog"
            aria-modal="true"
            aria-label="Share as poster"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Share as poster</h3>
                <p className="mt-1 text-sm text-ink2">
                  Pick a visual style. Copy the link or preview it in a new tab.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-ink2 transition hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STYLES.map((s) => (
                <div key={s.n} className="flex flex-col gap-2 rounded border border-line bg-bg p-4">
                  <div>
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="mt-1 text-xs text-ink2">{s.desc}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCopy(s.n)}
                      className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink transition hover:border-line-strong"
                    >
                      {copiedStyle === s.n ? 'Copied!' : 'Copy link'}
                    </button>
                    <a
                      href={urlFor(s.n)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink2 transition hover:border-line-strong hover:text-ink"
                    >
                      Preview ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
