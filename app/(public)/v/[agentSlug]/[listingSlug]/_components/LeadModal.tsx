'use client';

/**
 * LeadModal — UI-only contact form for the public listing page.
 *
 * Phase 3.6: form fields + client-side validation + body-scroll lock + Esc
 * close + backdrop close. Submission is fake — shows an inline confirmation
 * then auto-closes. Phase 5 wires the actual POST + Resend email.
 *
 * Mobile: bottom-sheet (slides up from bottom, full-width, rounded top).
 * Desktop: centered card.
 */

import { useEffect, useRef, useState } from 'react';
import type { FeedAgent, FeedListing } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
  agent: FeedAgent;
  listing: FeedListing;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loose phone match: 7+ digits, allows +, spaces, dashes, parens.
const PHONE_RE = /^[\d+\-\s()]{7,}$/;

export function LeadModal({ open, onClose, agent, listing }: Props) {
  const firstName = agent.name.split(' ')[0] ?? agent.name;
  const defaultMessage = `Hi ${firstName}, I'm interested in ${listing.address}.`;

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Reset form whenever modal reopens.
  useEffect(() => {
    if (open) {
      setName('');
      setContact('');
      setMessage(defaultMessage);
      setError(null);
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
    setSubmitted(true);
    // UI-only: auto-close after a moment. Phase 5 replaces with real POST.
    setTimeout(() => onClose(), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
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
        className="w-full max-w-md rounded-t-2xl border border-bronze/30 bg-ink2 p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="lead-modal-title" className="font-serif text-cream text-lg">
              Contact {firstName}
            </h2>
            <p className="mt-0.5 text-cream/60 text-xs">{listing.address}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-2 p-2 text-cream/60 hover:text-cream"
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
          <div className="rounded-md border border-gold/40 bg-gold/10 p-4 text-center">
            <p className="font-medium text-cream text-sm">Thanks, {name.split(' ')[0]}!</p>
            <p className="mt-1 text-cream/70 text-xs">
              Real submission wires in Phase 5 (Resend email).
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-cream/80 text-xs">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-ink px-3 py-2 text-cream text-sm placeholder:text-cream/40 focus:border-gold focus:outline-none"
                placeholder="Jane Smith"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-cream/80 text-xs">Phone or email</span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-ink px-3 py-2 text-cream text-sm placeholder:text-cream/40 focus:border-gold focus:outline-none"
                placeholder="(555) 123-4567 or jane@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-cream/80 text-xs">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-white/15 bg-ink px-3 py-2 text-cream text-sm placeholder:text-cream/40 focus:border-gold focus:outline-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-[12px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-gold px-4 py-2.5 font-semibold text-ink text-sm transition-colors hover:bg-gold/90"
            >
              Send to {firstName}
            </button>
            <p className="text-center text-[11px] text-cream/50">
              By sending, you agree to be contacted about this listing.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
