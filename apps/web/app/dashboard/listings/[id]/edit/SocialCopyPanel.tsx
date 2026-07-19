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
 *   - Phase 48.3 (2026-06-22): Save button + saved drafts list. Drafts
 *     persist to `saved_social_drafts`. Hints trimmed to word counts.
 *   - Phase 48.4 (2026-06-22): Editable output + inline edit on saved
 *     drafts. Edits feed back into Regenerate as seed (server forwards
 *     `previous_drafts` to the model so it refines instead of starting
 *     fresh — agent voice & specifics survive a regen click).
 *
 * Backend (`/api/generate-social`) takes platform/language arrays for
 * forward compat — we send 1-element arrays.
 */

import { Copy, Loader2, Pencil, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
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
  title: string | null;
  created_at: string;
  updated_at: string;
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
  // `output` is the live editable buffer in the right pane. The user can
  // tweak it; we send it back as the seed on Regenerate.
  const [output, setOutput] = useState<string | null>(null);
  // Once the user types into `output`, we set this so Regenerate forwards
  // it as `previous_drafts`. Reset whenever a fresh response comes in.
  const [outputEdited, setOutputEdited] = useState(false);
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

    // If the agent edited the right-pane output for THIS (platform,
    // language) cell, forward it as a refine seed. The model preserves
    // their phrasing/facts and just polishes per the platform brief.
    const previous_drafts =
      output && outputEdited
        ? { [platform]: { [language]: output } }
        : undefined;

    try {
      const res = await fetch('/api/generate-social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          platforms: [platform],
          languages: [language],
          ...(highlights.length > 0 ? { highlights } : {}),
          ...(previous_drafts ? { previous_drafts } : {}),
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
      > & { cached?: boolean };
      const text = data?.[platform]?.[language] ?? '';
      if (!text) throw new Error('Empty response');
      setOutput(text);
      setOutputEdited(false);
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

  async function onPatchDraft(
    draftId: string,
    patch: { body?: string; title?: string | null },
  ): Promise<string | null> {
    try {
      const payload: Record<string, unknown> = { draft_id: draftId };
      if (patch.body !== undefined) payload.body = patch.body;
      if (patch.title !== undefined) payload.title = patch.title ?? '';
      const res = await fetch(`/api/listings/${listingId}/social-drafts`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429) return 'Edited too fast — wait a minute.';
        if (res.status === 404) return 'Draft not found (may have been deleted).';
        return data.error ?? `HTTP ${res.status}`;
      }
      const data = (await res.json()) as { draft: Draft };
      // Replace the row and re-sort by updated_at desc to match server order.
      setDrafts((prev) => {
        const next = prev.map((d) => (d.id === draftId ? data.draft : d));
        next.sort((a, b) =>
          (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at),
        );
        return next;
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'unknown';
    }
  }

  function onChangeOutput(v: string) {
    setOutput(v);
    setOutputEdited(true);
  }
  function onRefineDraft(d: Draft) {
    setPlatform(d.platform);
    setLanguage(d.language);
    setOutput(d.body);
    setOutputEdited(true); // treat as a seed by default
    setError(null);
    setSaveError(null);
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
                  {output
                    ? outputEdited
                      ? 'Refine from edits'
                      : 'Regenerate'
                    : 'Generate'}
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
          {output !== null ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-ink text-sm font-medium">
                  {platformLabel(platform)}
                </span>
                <span className="text-muted text-[11px]">
                  {languageLabel(language)}
                </span>
                {outputEdited && (
                  <span className="rounded bg-ink2/15 px-1.5 py-0.5 text-ink2 text-[10px]">
                    edited
                  </span>
                )}
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
                value={output}
                onChange={(e) => onChangeOutput(e.target.value)}
                rows={Math.min(20, Math.max(8, output.split('\n').length + 1))}
                className={`${INPUT_CLASS} resize-y font-mono text-xs`}
              />
              <p className="mt-1 text-muted text-[11px]">
                Edit freely. Click <strong>Refine from edits</strong> to
                regenerate while keeping your changes as the seed.
              </p>
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
              <DraftRow
                key={d.id}
                draft={d}
                onDelete={() => onDeleteDraft(d.id)}
                onPatch={(patch) => onPatchDraft(d.id, patch)}
                onRefine={() => onRefineDraft(d)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface DraftRowProps {
  draft: Draft;
  onDelete: () => void;
  onPatch: (patch: { body?: string; title?: string | null }) => Promise<string | null>;
  onRefine: () => void;
}

function DraftRow({ draft, onDelete, onPatch, onRefine }: DraftRowProps) {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(draft.body);
  const [renaming, setRenaming] = useState(false);
  const [titleBuffer, setTitleBuffer] = useState(draft.title ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync buffers when the draft prop changes (e.g. after a successful PATCH
  // returns the updated row, or after a Refine cycle).
  useEffect(() => {
    if (!editing) setBuffer(draft.body);
  }, [draft.body, editing]);
  useEffect(() => {
    if (!renaming) setTitleBuffer(draft.title ?? '');
  }, [draft.title, renaming]);

  async function commitBody() {
    if (buffer.trim().length === 0) {
      setErr('Body cannot be empty.');
      return;
    }
    if (buffer === draft.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErr(null);
    const result = await onPatch({ body: buffer });
    setSaving(false);
    if (result) {
      setErr(result);
      return;
    }
    setEditing(false);
  }

  function cancelBody() {
    setBuffer(draft.body);
    setErr(null);
    setEditing(false);
  }

  async function commitTitle() {
    const next = titleBuffer.trim();
    const current = draft.title ?? '';
    if (next === current) {
      setRenaming(false);
      return;
    }
    if (next.length > 120) {
      setErr('Title too long (max 120 characters).');
      return;
    }
    setSaving(true);
    setErr(null);
    // Empty string clears title (server treats '' as null).
    const result = await onPatch({ title: next });
    setSaving(false);
    if (result) {
      setErr(result);
      return;
    }
    setRenaming(false);
  }

  function cancelTitle() {
    setTitleBuffer(draft.title ?? '');
    setErr(null);
    setRenaming(false);
  }

  const stamp = draft.updated_at ?? draft.created_at;
  const edited =
    draft.updated_at && draft.updated_at !== draft.created_at;

  // Heading: agent-set title, or fall back to "Platform · Language".
  const heading = draft.title ?? `${platformLabel(draft.platform)} · ${languageLabel(draft.language)}`;
  const hasCustomTitle = draft.title !== null && draft.title.length > 0;

  return (
    <li className="rounded-lg border border-line bg-bg p-3">
      {/* Title row (rename UI) */}
      {renaming ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={titleBuffer}
            onChange={(e) => setTitleBuffer(e.target.value)}
            placeholder="Title (optional, e.g. Open house — front yard)"
            maxLength={120}
            autoFocus
            className="flex-1 min-w-[200px] rounded border border-line bg-surface px-2 py-1 text-ink text-xs placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-line-strong"
          />
          <button
            type="button"
            onClick={commitTitle}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
          <button
            type="button"
            onClick={cancelTitle}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink2 hover:bg-ink2/20 disabled:opacity-50"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      ) : (
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`text-sm ${hasCustomTitle ? 'text-ink font-medium' : 'text-ink2'}`}
          >
            {heading}
          </span>
        </div>
      )}

      {/* Meta + actions row */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-muted text-[11px]">
          {new Date(stamp).toLocaleString()}
          {edited && ' (edited)'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {!editing && !renaming && (
            <>
              <button
                type="button"
                onClick={onRefine}
                title="Load into the editor above to refine with AI"
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20"
              >
                <Sparkles size={12} />
                Refine
              </button>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                title="Rename this draft"
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20"
              >
                <Tag size={12} />
                Rename
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit this draft in place"
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-ink2/20"
              >
                <Pencil size={12} />
                Edit
              </button>
              <CopyButton value={draft.body} />
              <button
                type="button"
                onClick={onDelete}
                title="Delete draft"
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink2 hover:border-red-400 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={commitBody}
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
              <button
                type="button"
                onClick={cancelBody}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-ink2 hover:bg-ink2/20 disabled:opacity-50"
              >
                <X size={12} />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {err && <p className="mb-1 text-red-400 text-[11px]">{err}</p>}
      {editing ? (
        <textarea
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          rows={Math.min(20, Math.max(6, buffer.split('\n').length + 1))}
          maxLength={8192}
          className={`${INPUT_CLASS} resize-y font-mono text-xs`}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-mono text-ink2 text-[11px] leading-relaxed">
          {draft.body}
        </pre>
      )}
    </li>
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
