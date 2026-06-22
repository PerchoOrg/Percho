'use client';

/**
 * Social copy generator panel — L/R split with persistent saved drafts.
 *
 * History:
 *   - Phase 6.3b: FB + IG only.
 *   - Phase 8.4: Added Email, 3-tab horizontal.
 *   - Phase 48: Multi-platform × multi-language checkbox grid.
 *   - Phase 48.1 (2026-06-22): L/R split, single platform × single
 *     language per click via dropdowns.
 *   - Phase 48.3 (2026-06-22): Save button + saved drafts list under
 *     the output. Drafts persist to `saved_social_drafts` table —
 *     refresh-safe. Hints trimmed to bare word-count caps.
 *
 * Backend (`/api/generate-social`) still takes platform/language arrays
 * for forward compat — we send 1-element arrays.
 */

import { Copy, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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

interface Draft {
  id: string;
  platform: Platform;
  language: Language;
  body: string;
  highlights: string[] | null;
  created_at: string;
}

const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'Email' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'threads', label: 'Threads' },
  { id: 'rednote', label: 'Rednote (小红书)' },
  { id: 'wechat', label: 'WeChat Moments (朋友圈)' },
];

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'es', label: 'Español' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'ko', label: '한국어' },
];

const HIGHLIGHTS_MAX_WORDS = 50;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function platformLabel(id: Platform): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

function languageLabel(id: Language): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function SocialCopyPanel({ listingId }: Props) {
  const [highlightsRaw, setHighlightsRaw] = useState('');
  const [platform, setPlatform] = useState<Platform>('facebook');
  const [language, setLanguage] = useState<Language>('en');
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const highlightsWords = countWords(highlightsRaw);
  const highlightsOver = highlightsWords > HIGHLIGHTS_MAX_WORDS;

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch(
        `/api/listings/${listingId}/social-drafts`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: Draft[] };
      setDrafts(data.drafts ?? []);
    } catch {
      // Soft fail — saved drafts are an enhancement, not blocking.
    } finally {
      setDraftsLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  async function onGenerate() {
    if (highlightsOver) return;
    setState('loading');
    setError(null);
    setSaveError(null);
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

  async function onSave() {
    if (!output) return;
    setSaving(true);
    setSaveError(null);
    const highlights = highlightsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
    try {
      const res = await fetch(`/api/listings/${listingId}/social-drafts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform,
          language,
          body: output,
          ...(highlights.length > 0 ? { highlights } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429) throw new Error('Saved too fast — wait a minute.');
        if (res.status === 409) throw new Error('Draft cap reached for this listing (50). Delete some.');
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { draft: Draft };
      setDrafts((prev) => [data.draft, ...prev]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteDraft(draftId: string) {
    const prev = drafts;
    setDrafts(drafts.filter((d) => d.id !== draftId));
    try {
      const res = await fetch(`/api/listings/${listingId}/social-drafts`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId }),
      });
      if (!res.ok) {
        // Roll back optimistic delete.
        setDrafts(prev);
      }
    } catch {
      setDrafts(prev);
    }
  }

  return (
    <div className="space-y-6">
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
            <span
              className={`mt-1 block text-xs ${
                highlightsOver ? 'text-red-400' : 'text-muted'
              }`}
            >
              Up to {HIGHLIGHTS_MAX_WORDS} words ({highlightsWords}/
              {HIGHLIGHTS_MAX_WORDS})
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
              disabled={state === 'loading' || highlightsOver}
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
                  {platformLabel(platform)}
                </span>
                <span className="text-muted text-[11px]">
                  {languageLabel(language)}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    Save
                  </button>
                  <CopyButton value={output} />
                </div>
              </div>
              {saveError && (
                <p className="mb-2 text-red-400 text-[11px]">{saveError}</p>
              )}
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

      {/* Saved drafts list */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-ink text-sm font-medium">
            Saved drafts{' '}
            <span className="text-muted text-xs">
              ({drafts.length})
            </span>
          </h3>
          {draftsLoading && (
            <Loader2 size={12} className="animate-spin text-muted" />
          )}
        </div>
        {drafts.length === 0 ? (
          <p className="text-muted text-xs">
            No saved drafts yet. Click <strong>Save</strong> on a generated
            post to keep it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-line bg-bg p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-ink text-xs font-medium">
                    {platformLabel(d.platform)}
                  </span>
                  <span className="text-muted text-[11px]">
                    {languageLabel(d.language)}
                  </span>
                  <span className="text-muted text-[11px]">
                    · {new Date(d.created_at).toLocaleString()}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <CopyButton value={d.body} />
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(d.id)}
                      title="Delete draft"
                      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink2 hover:border-red-400 hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-ink2 text-[11px] leading-relaxed">
                  {d.body}
                </pre>
              </li>
            ))}
          </ul>
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
      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20"
    >
      <Copy size={12} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong';
