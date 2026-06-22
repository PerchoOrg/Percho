'use client';

/**
 * Social copy generator panel.
 *
 * History:
 *   - Phase 6.3b: FB + IG only.
 *   - Phase 8.4: Added Email, 3-tab horizontal.
 *   - Phase 48: Multi-platform × multi-language checkbox grid.
 *   - Phase 48.1 (2026-06-22): L/R split. Left = inputs (selling points,
 *     platform dropdown, language dropdown, Generate). Right = single
 *     output. One platform × one language per click — simpler signal,
 *     less waste, dropdowns scale to N platforms without UI rework.
 *
 * Backend (`/api/generate-social`) still takes arrays for forward compat
 * — we just send a 1-element array for each.
 */

import { Copy, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface Props {
  listingId: string;
}

type GenState = 'idle' | 'loading' | 'error';

type Platform =
  | 'facebook'
  | 'instagram'
  | 'email'
  | 'tiktok'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'rednote'
  | 'wechat';

type Language = 'en' | 'zh' | 'es' | 'vi' | 'ko';

const PLATFORMS: Array<{ id: Platform; label: string; limitHint: string }> = [
  { id: 'facebook', label: 'Facebook', limitHint: '~150 words' },
  { id: 'instagram', label: 'Instagram', limitHint: '~80 words + hashtags' },
  { id: 'email', label: 'Email', limitHint: '~200 words' },
  { id: 'tiktok', label: 'TikTok', limitHint: '~50 words + hashtags' },
  { id: 'x', label: 'X (Twitter)', limitHint: '<270 chars' },
  { id: 'linkedin', label: 'LinkedIn', limitHint: '~150 words' },
  { id: 'threads', label: 'Threads', limitHint: '~80 words' },
  { id: 'rednote', label: 'Rednote (小红书)', limitHint: '~120 字 + 标签' },
  { id: 'wechat', label: 'WeChat Moments (朋友圈)', limitHint: '~100 字' },
];

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'es', label: 'Español' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'ko', label: '한국어' },
];

export function SocialCopyPanel({ listingId }: Props) {
  const [highlightsRaw, setHighlightsRaw] = useState('');
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [language, setLanguage] = useState<Language>('en');
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const platformMeta = PLATFORMS.find((p) => p.id === platform)!;

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
          platforms: [platform],
          languages: [language],
          ...(highlights.length > 0 ? { highlights } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429)
          throw new Error('Rate limit hit — try again in a minute.');
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Partial<
        Record<Platform, Partial<Record<Language, string>>>
      >;
      const text = data?.[platform]?.[language] ?? '';
      if (!text) throw new Error('Empty response');
      setOutput(text);
      setState('idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'unknown');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: inputs */}
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div>
          <label
            className="mb-1 block text-ink2 text-xs"
            htmlFor="sc-highlights"
          >
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
            Up to 5 items, comma-separated. The model also reads this listing's
            description, photo captions, and video titles.
          </span>
        </div>

        <div>
          <label
            className="mb-1 block text-ink2 text-xs"
            htmlFor="sc-platform"
          >
            Platform
          </label>
          <select
            id="sc-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className={INPUT_CLASS}
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-muted text-xs">
            Target length: {platformMeta.limitHint}
          </span>
        </div>

        <div>
          <label
            className="mb-1 block text-ink2 text-xs"
            htmlFor="sc-language"
          >
            Language
          </label>
          <select
            id="sc-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className={INPUT_CLASS}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
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
                {output ? 'Regenerate' : 'Generate'}
              </>
            )}
          </button>
          {state === 'error' && (
            <span className="text-red-400 text-xs">
              {error ?? 'unknown error'}
            </span>
          )}
        </div>
      </div>

      {/* Right: output */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
        {output ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-ink text-sm font-medium">
                {platformMeta.label}
              </span>
              <span className="text-muted text-[11px]">
                {LANGUAGES.find((l) => l.id === language)?.label}
              </span>
              <div className="ml-auto">
                <CopyButton value={output} />
              </div>
            </div>
            <textarea
              readOnly
              value={output}
              rows={Math.min(20, Math.max(8, output.split('\n').length + 1))}
              className={`${INPUT_CLASS} resize-y font-mono text-xs`}
            />
          </>
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center text-muted text-xs">
            Generated copy will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
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
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20"
    >
      <Copy size={12} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong';
