'use client';

/**
 * Social copy generator panel — Phase 6.3b (rebuilt 8.4 for tabbed UX).
 *
 * Lives on the listing edit page below the metadata form. Calls
 * /api/generate-social with the listing id + a transient `highlights` input
 * (3-5 short selling points). Renders Facebook / Instagram / Email copy in
 * three tabs with per-tab Regenerate + Copy actions.
 *
 * Phase 8.4 changes:
 *   - Email tab added (replaces demo's 小红书 — V1 is English-only US market;
 *     email blasts are the actual conversion lever for US agents).
 *   - Tab UI matches `vicinity-app/src/pages/Editor.jsx` S5 visual treatment.
 *   - Per-tab regenerate button so a single bad output doesn't burn the rate
 *     limit budget for the other two — though backend still bills 1 unit per
 *     call regardless, so heads-up: regenerating any tab regenerates ALL three
 *     (the prompt produces the full triple). UI just lets you focus.
 *
 * Nothing persists. The whole component is throwaway state — refresh and
 * you start over.
 */

import { Copy, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface Props {
  listingId: string;
}

type GenState = 'idle' | 'loading' | 'error';
type Platform = 'facebook' | 'instagram' | 'email';

interface SocialOutput {
  facebook: string;
  instagram: string;
  email: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  email: 'Email',
};

const PLATFORM_ROWS: Record<Platform, number> = {
  facebook: 6,
  instagram: 4,
  email: 10,
};

export function SocialCopyPanel({ listingId }: Props) {
  const [highlightsRaw, setHighlightsRaw] = useState('');
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<SocialOutput | null>(null);
  const [tab, setTab] = useState<Platform>('facebook');

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
      {/* Highlights input */}
      <div>
        <label className="mb-1 block text-ink2 text-xs" htmlFor="sc-highlights">
          Selling points (optional)
        </label>
        <input
          id="sc-highlights"
          type="text"
          value={highlightsRaw}
          onChange={(e) => setHighlightsRaw(e.target.value)}
          placeholder="e.g. renovated kitchen, walk to schools"
          className={INPUT_CLASS}
          maxLength={500}
        />
        <span className="mt-1 block text-muted text-xs">
          Up to 5, comma-separated. Leave blank to let the model riff on listing details.
        </span>
      </div>

      {/* Platform tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setTab(p)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              tab === p
                ? 'border-line-strong bg-ink text-cream'
                : 'border-line text-ink2 hover:border-line-strong hover:text-ink'
            }`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
        {state === 'error' && (
          <span className="ml-auto text-red-400 text-xs">{error ?? 'unknown error'}</span>
        )}
      </div>

      {/* Active tab textarea */}
      <textarea
        readOnly={!output}
        value={output ? output[tab] : ''}
        onChange={() => {}}
        rows={PLATFORM_ROWS[tab]}
        placeholder={
          state === 'loading'
            ? 'Generating…'
            : `Click Generate to produce ${PLATFORM_LABELS[tab]} copy.`
        }
        className={`${INPUT_CLASS} resize-y font-mono text-xs`}
      />

      {/* Action row */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={state === 'loading'}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 font-medium text-cream text-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {state === 'loading' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              {output ? 'Regenerate' : 'Generate copy'}
            </>
          )}
        </button>
        {output && <CopyButton value={output[tab]} />}
      </div>

      {/* Compact preview of the other two tabs (collapsed) */}
      {output && (
        <details className="rounded-lg border border-line bg-surface p-3 text-xs">
          <summary className="cursor-pointer text-ink2 hover:text-ink">
            See all 3 platforms side-by-side
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <div
                key={p}
                className="flex flex-col rounded-lg border border-line bg-bg p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-ink uppercase tracking-widest">
                    {PLATFORM_LABELS[p]}
                  </span>
                  <CopyButton value={output[p]} small />
                </div>
                <textarea
                  readOnly
                  value={output[p]}
                  rows={6}
                  className={`${INPUT_CLASS} flex-1 resize-none font-mono text-[11px]`}
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function CopyButton({ value, small = false }: { value: string; small?: boolean }) {
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
  if (small) {
    return (
      <button
        type="button"
        onClick={onCopy}
        className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink hover:bg-ink2/20"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-ink text-sm hover:bg-ink2/20"
    >
      <Copy size={14} />
      {copied ? 'Copied' : 'Copy to clipboard'}
    </button>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong';
