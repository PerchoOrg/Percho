'use client';

/**
 * CopyLinkButton — pill displaying the (truncated) public URL with a copy icon.
 *
 * Demo parity: dashboard listings show the actual public link, click-to-copy
 * with a 1.6s "Copied!" affordance. native share on mobile when available.
 */

import { useCallback, useState } from 'react';

interface Props {
  /** Path component, e.g. /v/agent-slug/listing-slug */
  path: string;
  /** Optional label override; defaults to the path */
  display?: string;
}

function getOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export function CopyLinkButton({ path, display }: Props) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    const url = `${getOrigin()}${path}`;
    // Prefer native share on mobile when available — feels more "premium"
    // than a clipboard toast because the user picks their channel.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          url,
          title: 'Percho listing',
        });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // last resort — let the user see it
      window.prompt('Copy link', url);
    }
  }, [path]);

  const label = display ?? path;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs text-ink2 transition hover:border-line-strong hover:text-ink"
      title="Copy public link"
    >
      <svg
        viewBox="0 0 24 24"
        width={12}
        height={12}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" />
      </svg>
      <span className="truncate font-mono tabular-nums">{copied ? 'Copied ✓' : label}</span>
    </button>
  );
}
