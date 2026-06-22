'use client';

/**
 * Social copy generator panel — Phase 48 (multi-platform × multi-language).
 *
 * History:
 *   - Phase 6.3b: Facebook + Instagram only.
 *   - Phase 8.4: Added Email, fixed 3-tab horizontal layout.
 *   - Phase 48: Pivoted to checkbox grid — agent picks which platforms and
 *     which languages they want, output is a 2-D map rendered as a list of
 *     platform sections each with language sub-tabs. Tab bar broke at 5+
 *     platforms; sections scale to 9 cleanly.
 *
 * Output is regenerated atomically — one button generates every selected
 * (platform, language) cell in a single Anthropic call. The model receives
 * the full listing description, photo alt-text, and video titles as
 * grounding so copy references real content instead of address+price alone.
 *
 * Nothing persists. Refresh and you start over.
 */

import { Copy, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

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

type Output = Partial<Record<Platform, Partial<Record<Language, string>>>>;

const PLATFORMS: Array<{ id: Platform; label: string; hint: string }> = [
  { id: 'facebook', label: 'Facebook', hint: 'Long-form post' },
  { id: 'instagram', label: 'Instagram', hint: 'Caption + hashtags' },
  { id: 'email', label: 'Email', hint: 'Buyer database blast' },
  { id: 'tiktok', label: 'TikTok', hint: 'Short caption + tags' },
  { id: 'x', label: 'X', hint: '<270 chars' },
  { id: 'linkedin', label: 'LinkedIn', hint: 'Professional post' },
  { id: 'threads', label: 'Threads', hint: 'Conversational' },
  { id: 'rednote', label: 'Rednote (小红书)', hint: 'Lifestyle note' },
  { id: 'wechat', label: 'WeChat Moments', hint: '朋友圈 post' },
];

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'es', label: 'Español' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'ko', label: '한국어' },
];

const MAX_PLATFORMS = 6;
const MAX_LANGUAGES = 4;

export function SocialCopyPanel({ listingId }: Props) {
  const [highlightsRaw, setHighlightsRaw] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(
    () => new Set<Platform>(['facebook', 'instagram', 'email']),
  );
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(
    () => new Set<Language>(['en']),
  );
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [activeLangByPlatform, setActiveLangByPlatform] = useState<
    Partial<Record<Platform, Language>>
  >({});

  const platformCount = selectedPlatforms.size;
  const languageCount = selectedLanguages.size;
  const cellCount = platformCount * languageCount;
  const overLimit =
    platformCount > MAX_PLATFORMS || languageCount > MAX_LANGUAGES;

  const orderedPlatforms = useMemo(
    () => PLATFORMS.filter((p) => selectedPlatforms.has(p.id)),
    [selectedPlatforms],
  );
  const orderedLanguages = useMemo(
    () => LANGUAGES.filter((l) => selectedLanguages.has(l.id)),
    [selectedLanguages],
  );

  function togglePlatform(id: Platform) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLanguage(id: Language) {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onGenerate() {
    if (cellCount === 0 || overLimit) return;
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
          platforms: Array.from(selectedPlatforms),
          languages: Array.from(selectedLanguages),
          ...(highlights.length > 0 ? { highlights } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429)
          throw new Error('Rate limit hit — try again in a minute.');
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Output;
      setOutput(data);
      setState('idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'unknown');
    }
  }

  return (
    <div className="space-y-5">
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
          Up to 5, comma-separated. The model also uses this listing's
          description, photo captions, and video titles as context — leave
          blank to let it riff on those alone.
        </span>
      </div>

      {/* Platform + language selectors, side-by-side on wide screens */}
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-lg border border-line bg-bg p-3">
          <legend className="px-1 text-ink2 text-xs">
            Platforms{' '}
            <span className={platformCount > MAX_PLATFORMS ? 'text-red-400' : 'text-muted'}>
              ({platformCount}/{MAX_PLATFORMS})
            </span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = selectedPlatforms.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  title={p.hint}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? 'border-line-strong bg-ink text-cream'
                      : 'border-line text-ink2 hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-bg p-3">
          <legend className="px-1 text-ink2 text-xs">
            Languages{' '}
            <span className={languageCount > MAX_LANGUAGES ? 'text-red-400' : 'text-muted'}>
              ({languageCount}/{MAX_LANGUAGES})
            </span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => {
              const on = selectedLanguages.has(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLanguage(l.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? 'border-line-strong bg-ink text-cream'
                      : 'border-line text-ink2 hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={state === 'loading' || cellCount === 0 || overLimit}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 font-medium text-cream text-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {state === 'loading' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating {cellCount} {cellCount === 1 ? 'post' : 'posts'}…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              {output ? 'Regenerate' : 'Generate'} {cellCount}{' '}
              {cellCount === 1 ? 'post' : 'posts'}
            </>
          )}
        </button>
        {cellCount === 0 && (
          <span className="text-muted text-xs">
            Pick at least one platform and one language.
          </span>
        )}
        {overLimit && (
          <span className="text-red-400 text-xs">
            Cap is {MAX_PLATFORMS} platforms × {MAX_LANGUAGES} languages per
            run — narrow your selection.
          </span>
        )}
        {state === 'error' && (
          <span className="ml-auto text-red-400 text-xs">
            {error ?? 'unknown error'}
          </span>
        )}
      </div>

      {/* Output sections — one card per platform, language sub-tabs inside */}
      {output && (
        <div className="space-y-3">
          {orderedPlatforms.map((p) => {
            const cell = output[p.id];
            if (!cell) return null;
            const availableLangs = orderedLanguages.filter(
              (l) => typeof cell[l.id] === 'string',
            );
            if (availableLangs.length === 0) return null;
            const activeLang =
              activeLangByPlatform[p.id] ?? availableLangs[0]!.id;
            const value = cell[activeLang] ?? '';
            return (
              <div
                key={p.id}
                className="rounded-lg border border-line bg-bg p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-ink text-sm font-medium">
                    {p.label}
                  </span>
                  <span className="text-muted text-[11px]">{p.hint}</span>
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {availableLangs.length > 1 &&
                      availableLangs.map((l) => {
                        const on = l.id === activeLang;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() =>
                              setActiveLangByPlatform((prev) => ({
                                ...prev,
                                [p.id]: l.id,
                              }))
                            }
                            className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                              on
                                ? 'bg-ink text-cream'
                                : 'text-ink2 hover:bg-line/40'
                            }`}
                          >
                            {l.label}
                          </button>
                        );
                      })}
                    <CopyButton value={value} small />
                  </div>
                </div>
                <textarea
                  readOnly
                  value={value}
                  rows={Math.min(12, Math.max(4, value.split('\n').length + 1))}
                  className={`${INPUT_CLASS} resize-y font-mono text-xs`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CopyButton({
  value,
  small = false,
}: {
  value: string;
  small?: boolean;
}) {
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
        {copied ? '✓ Copied' : 'Copy'}
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
