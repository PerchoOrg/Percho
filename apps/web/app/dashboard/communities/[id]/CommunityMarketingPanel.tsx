'use client';

/**
 * CommunityMarketingPanel — language-only marketing copy for a community.
 *
 * Phase 50 (2026-06-22). The community sibling of SocialCopyPanel. Unlike
 * the listing flow, community marketing is not platform-aware — buyers
 * arrive at a single `/c/<slug>` URL regardless of channel, so the only
 * axis that matters is *language*. The agent picks a language, generates
 * a 150-250 word marketing body grounded in the community's videos +
 * schools + POIs (see `lib/ai/anthropic.ts::generateCommunityMarketing`),
 * edits inline, then saves to a per-language drafts list.
 *
 * Drafts persist to `saved_social_drafts` with `community_id` set,
 * `listing_id` null, `platform` null, `language` set. RLS scopes them
 * to the owning agent (migrations 0029 + 0034).
 *
 * Regenerate forwards an edited body as `previous_drafts[language]` so
 * the model refines instead of starting fresh — same UX as the listing
 * social-copy panel.
 */

import { Copy, Loader2, Pencil, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface Props {
  communityId: string;
}

type GenState = 'idle' | 'loading' | 'error';

type Language = 'en' | 'zh' | 'es' | 'vi' | 'ko';

interface Draft {
  id: string;
  language: Language;
  body: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'es', label: 'Español' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'ko', label: '한국어' },
];

function languageLabel(id: Language): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function CommunityMarketingPanel({ communityId }: Props) {
  const [language, setLanguage] = useState<Language>('en');
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [outputEdited, setOutputEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuf, setEditBuf] = useState('');

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/social-drafts`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: Draft[] };
      setDrafts(data.drafts ?? []);
    } catch {
      // soft-fail
    } finally {
      setDraftsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  async function onGenerate() {
    setState('loading');
    setError(null);
    setSaveError(null);

    const previous_drafts = output && outputEdited ? { [language]: output } : undefined;

    try {
      const res = await fetch('/api/generate-marketing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          community_id: communityId,
          languages: [language],
          ...(previous_drafts ? { previous_drafts } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 429) {
          throw new Error('Rate limit hit — try again in a minute.');
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Partial<Record<Language, string>>;
      const text = data?.[language] ?? '';
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
    try {
      const res = await fetch(`/api/communities/${communityId}/social-drafts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language, body: output }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409 && body.error === 'cap_reached') {
          throw new Error('Saved-drafts cap reached. Delete one to save more.');
        }
        if (res.status === 429) {
          throw new Error('Rate limit hit — try again in a minute.');
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchDrafts();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    try {
      await fetch(`/api/communities/${communityId}/social-drafts`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft_id: id }),
      });
    } catch {
      // refresh on failure to recover state
      void fetchDrafts();
    }
  }

  function startEdit(d: Draft) {
    setEditingId(d.id);
    setEditBuf(d.body);
  }

  async function commitEdit() {
    if (!editingId) return;
    const id = editingId;
    const body = editBuf;
    setEditingId(null);
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, body } : d)));
    try {
      await fetch(`/api/communities/${communityId}/social-drafts`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft_id: id, body }),
      });
    } catch {
      void fetchDrafts();
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4">
        <p className="mt-1 text-muted text-xs">
          Generate a 150–250 word body grounded in your videos, schools, and nearby points of
          interest. Edit inline, save per language. The model is told it must not invent
          neighborhood facts.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: language picker + generate */}
        <div className="space-y-3">
          <label className="block text-ink2 text-xs">
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onGenerate}
            disabled={state === 'loading'}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 font-medium text-cream text-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {state === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{output ? 'Regenerate' : 'Generate'}</span>
          </button>

          {error && <p className="text-rose-700 text-xs">Error: {error}</p>}
        </div>

        {/* Right: editable output + save */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-ink2 text-xs" htmlFor="community-marketing-output">
              {languageLabel(language)} marketing body
            </label>
            <div className="flex items-center gap-2">
              {output && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(output);
                  }}
                  className="inline-flex items-center gap-1 text-muted text-xs hover:text-ink"
                  title="Copy to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
              )}
              {output && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded border border-line bg-bg px-2 py-1 text-ink text-xs hover:border-bronze disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>Save</span>
                </button>
              )}
            </div>
          </div>
          <textarea
            id="community-marketing-output"
            value={output ?? ''}
            onChange={(e) => {
              setOutput(e.target.value);
              if (!outputEdited) setOutputEdited(true);
            }}
            placeholder="Click Generate to draft a neighborhood marketing body…"
            rows={14}
            className="block w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm leading-relaxed"
          />
          {saveError && <p className="text-rose-700 text-xs">{saveError}</p>}
        </div>
      </div>

      {/* Saved drafts */}
      <div className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-medium text-ink text-sm">Saved drafts</h3>
          <span className="text-muted text-xs">
            {draftsLoading ? '…' : `${drafts.length} saved`}
          </span>
        </div>
        {drafts.length === 0 && !draftsLoading && (
          <p className="text-muted text-xs">
            No saved drafts yet. Generate a body and click Save to keep one per language for later
            reuse.
          </p>
        )}
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id} className="rounded-lg border border-line bg-bg p-3 text-sm">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-ink2 text-xs">
                  {languageLabel(d.language)}
                  {' · '}
                  {new Date(d.updated_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  {editingId === d.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void commitEdit()}
                        className="inline-flex items-center gap-1 text-ink text-xs hover:text-bronze"
                      >
                        <Save className="h-3.5 w-3.5" /> Save edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 text-muted text-xs hover:text-ink"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(d.body);
                        }}
                        className="inline-flex items-center gap-1 text-muted text-xs hover:text-ink"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="inline-flex items-center gap-1 text-muted text-xs hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteDraft(d.id)}
                        className="inline-flex items-center gap-1 text-muted text-xs hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editingId === d.id ? (
                <textarea
                  value={editBuf}
                  onChange={(e) => setEditBuf(e.target.value)}
                  rows={10}
                  className="block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm leading-relaxed"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-ink text-sm">{d.body}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
