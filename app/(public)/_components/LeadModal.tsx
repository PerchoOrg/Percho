'use client';

/**
 * LeadModal — contact form for the public listing page.
 *
 * Phase 3.6: UI + client-side validation + body-scroll lock + Esc/backdrop close.
 * Phase 5.1: real POST to `/api/leads` (client-side splits the single contact
 * field into email-or-phone based on regex match — server schema accepts
 * either). On success: shows inline confirmation, auto-closes after 1.5s.
 * On failure: surfaces the server error inline; user can retry.
 *
 * Mobile: bottom-sheet (slides up from bottom, full-width, rounded top).
 * Desktop: centered card.
 */

import { useEffect, useRef, useState } from 'react';

type LeadAgent = { name: string };
type LeadListing = { address: string };
type LeadCommunity = { name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  agent: LeadAgent;
  /** Listing-targeted lead. Mutually exclusive with `community`. */
  listing?: LeadListing;
  listingId?: string;
  /** Community-targeted lead (Phase 45.18 — direct community feed). */
  community?: LeadCommunity;
  communityId?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose phone match: 7+ digits, allows +, spaces, dashes, parens.
const PHONE_RE = /^[\d+\-\s()]{7,}$/;

export function LeadModal({
  open,
  onClose,
  agent,
  listing,
  listingId,
  community,
  communityId,
}: Props) {
  const firstName = agent.name.split(' ')[0] ?? agent.name;
  const target = listing?.address ?? community?.name ?? '';
  const defaultMessage = `Hi ${firstName}, I'm interested in ${target}.`;

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Reset form whenever modal reopens.
  useEffect(() => {
    if (open) {
      setName('');
      setContact('');
      setMessage(defaultMessage);
      setError(null);
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [open, defaultMessage]);

  // Body-scroll lock + Escape close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function validate(): string | null {
    if (!name.trim()) return 'Name is required';
    const c = contact.trim();
    if (!c) return 'Please provide phone or email';
    if (!EMAIL_RE.test(c) && !PHONE_RE.test(c)) return 'Enter a valid phone or email';
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);

    const c = contact.trim();
    const isEmail = EMAIL_RE.test(c);
    const payload = {
      listing_id: listingId ?? null,
      community_id: communityId ?? null,
      name: name.trim(),
      email: isEmail ? c : null,
      phone: isEmail ? null : c,
      message: message.trim() || null,
      source: communityId ? 'community-feed' : 'listing-page',
    };

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request_failed_${res.status}`);
        }
        setSubmitting(false);
        setSubmitted(true);
        setTimeout(() => onClose(), 1500);
      })
      .catch((err) => {
        setSubmitting(false);
        setError(
          err instanceof Error && err.message
            ? `Couldn't send: ${err.message}. Please try again.`
            : "Couldn't send. Please try again.",
        );
      });
  }

  return (
    <div
      // Phase 45.20 (2026-06-20): z-[70] so the modal stays above the
      // CommunityCarousel overlay (z-[60]). Previously z-50 — when a buyer
      // hit Contact from inside the carousel, the modal opened *behind*
      // the carousel and looked like a dead click.
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        // biome-ignore lint/a11y/useSemanticElements: native <dialog> conflicts with custom backdrop + scroll-lock; ARIA pattern is intentional
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="lead-modal-title" className="font-serif text-ink text-lg">
              Contact {firstName}
            </h2>
            <p className="mt-0.5 text-ink2 text-xs">{target}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-2 p-2 text-ink2 hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="rounded-md border border-line-strong bg-ink/10 p-4 text-center">
            <p className="font-medium text-ink text-sm">Thanks, {name.split(' ')[0]}!</p>
            <p className="mt-1 text-ink2 text-xs">{firstName} will reach out shortly.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-ink2 text-xs">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-ink text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
                placeholder="Jane Smith"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-ink2 text-xs">Phone or email</span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-ink text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
                placeholder="(555) 123-4567 or jane@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-ink2 text-xs">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-ink text-sm placeholder:text-muted focus:border-line-strong focus:outline-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-[12px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-md bg-ink px-4 py-2.5 font-semibold text-cream text-sm transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Sending…' : `Send to ${firstName}`}
            </button>
            <p className="text-center text-[11px] text-muted">
              By sending, you agree to be contacted about this listing.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
