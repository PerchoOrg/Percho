'use client';

/**
 * Social copy generator panel — Phase 6.3b.
 *
 * Lives on the listing edit page below the metadata form. Calls
 * /api/generate-social with the listing id + a transient `highlights` input
 * (3-5 short selling points). Renders the Facebook + Instagram copy in
 * read-only textareas with copy-to-clipboard buttons.
 *
 * Nothing persists. The whole component is throwaway state — refresh and
 * you start over. That's intentional for V1: the agent's deliverable is the
 * text on their clipboard, not a stored draft.
 */

import { useState } from 'react';

interface Props {
  listingId: string;
}

type GenState = 'idle' | 'loading' | 'error';

interface SocialOutput {
  facebook: string;
  instagram: string;
}

export function SocialCopyPanel({ listingId }: Props) {
  const [highlightsRaw, setHighlightsRaw] = useState('');
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<SocialOutput | null>(null);

  async function onGenerate() {
    setState('loading');
    setError(null);
    const highlights = highlightsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);

    try {
      const res = await fetch('/api/generate-social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          ...(highlights.length > 0 ? { highlights } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429) throw new Error('Rate limit hit — try again in a minute.');
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SocialOutput;
      setOutput(data);
      setState('idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'unknown');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-cream/70" htmlFor="sc-highlights">
          Selling points (optional)
        </label>
        <input
          id="sc-highlights"
          type="text"
          value={highlightsRaw}
          onChange={(e) => setHighlightsRaw(e.target.value)}
          placeholder="renovated kitchen, walk to schools, finished basement"
          className={INPUT_CLASS}
          maxLength={500}
        />
        <span className="mt-1 block text-xs text-cream/40">
          Up to 5, comma-separated. Leave blank to let the model riff on listing details.
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={state === 'loading'}
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {state === 'loading' ? 'Generating…' : '✨ Generate social copy'}
        </button>
        {state === 'error' && (
          <span className="text-sm text-red-400">Error: {error ?? 'unknown'}</span>
        )}
      </div>

      {output && (
        <div className="space-y-4 pt-2">
          <CopyBlock label="Facebook" value={output.facebook} rows={6} />
          <CopyBlock label="Instagram" value={output.instagram} rows={4} />
        </div>
      )}
    </div>
  );
}

function CopyBlock({ label, value, rows }: { label: string; value: string; rows: number }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — user can still select+copy manually.
    }
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-cream/70">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-bronze/50 px-2 py-0.5 text-xs text-cream hover:bg-bronze/20"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <textarea readOnly value={value} rows={rows} className={`${INPUT_CLASS} resize-y`} />
    </div>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-bronze/30 bg-ink2 px-3 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold';
