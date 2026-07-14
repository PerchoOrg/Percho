'use client';

/**
 * <CreateReelStep2Form> — step-2 UI for the mobile Create Reel wizard.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.8
 *
 * C6.2 scope: **form UI only, no submit logic**. Publish is disabled until
 * caption has any non-whitespace content, then rendered as an enabled but
 * non-functional pill (`type="button"`, no handler). Render trigger + Cloudflare
 * Stream upload wiring lands after the wizard shape is signed off — same
 * treatment as step-1 Next (C6.1) and AgentContactCTAs Message pill (A4.3).
 *
 * Fields (per reelestate reference screenshot 08, caption/tag/music panel):
 *   - Caption: multi-line textarea, 500-char soft cap w/ live counter.
 *   - Tags: comma-or-Enter chip input. Local state only, no autocomplete —
 *     the tag taxonomy is a schema call (CLAUDE.md §8) that hasn't been made
 *     yet, so this is just a chip capture UI. Backend save happens later.
 *   - Music: placeholder card labeled "Original audio" with a disabled "Change"
 *     affordance. Reelestate ships a music picker w/ a licensed library;
 *     Percho hasn't chosen a music source yet, so this is intentionally
 *     inert. Screenshot 08 shows the same slot.
 *
 * No mock data, no fetches, no Supabase reads — this is a pure client form.
 */
import { useState } from 'react';
import { Music, X } from 'lucide-react';

const CAPTION_MAX = 500;

export function CreateReelStep2Form() {
  const [caption, setCaption] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const canPublish = caption.trim().length > 0;

  function commitTag() {
    const raw = tagDraft.trim().replace(/^#+/, '');
    if (raw.length === 0) return;
    if (tags.includes(raw)) {
      setTagDraft('');
      return;
    }
    if (tags.length >= 8) return;
    setTags([...tags, raw]);
    setTagDraft('');
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-10">
      <section className="flex flex-col gap-2">
        <label htmlFor="reel-caption" className="text-[13px] font-medium text-white/70">
          Caption
        </label>
        <textarea
          id="reel-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
          rows={4}
          placeholder="Describe the property, the vibe, the deal…"
          className="w-full resize-none rounded-tile border border-bg-border bg-bg-surface p-3 text-[15px] leading-snug text-white placeholder:text-white/30 focus:border-cyan/60 focus:outline-none focus:ring-0"
        />
        <div className="flex justify-end text-[11px] text-white/40">
          {caption.length} / {CAPTION_MAX}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="reel-tags" className="text-[13px] font-medium text-white/70">
          Tags
        </label>
        <div className="flex flex-wrap items-center gap-2 rounded-tile border border-bg-border bg-bg-surface p-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-cyan/15 px-2.5 py-1 text-[12px] font-semibold text-cyan"
            >
              #{t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove ${t}`}
                className="text-cyan/70 hover:text-cyan"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <input
            id="reel-tags"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commitTag();
              } else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
                setTags(tags.slice(0, -1));
              }
            }}
            onBlur={commitTag}
            placeholder={tags.length === 0 ? 'Add up to 8 tags — Enter to confirm' : ''}
            className="min-w-[8ch] flex-1 bg-transparent p-1 text-[14px] text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-white/70">Music</span>
        <div className="flex items-center gap-3 rounded-tile border border-bg-border bg-bg-surface p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-tile bg-bg-elevated text-white/60">
            <Music className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-white">Original audio</span>
            <span className="text-[12px] text-white/50">
              Music library coming soon — original clip audio is used for now.
            </span>
          </span>
          <button
            type="button"
            disabled
            className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-semibold text-white/30"
          >
            Change
          </button>
        </div>
      </section>

      <button
        type="button"
        disabled={!canPublish}
        aria-label="Publish reel"
        className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-grad-cta text-[15px] font-semibold text-cyan-ink shadow-glow-cyan transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-bg-elevated disabled:text-white/30 disabled:shadow-none"
      >
        Publish
      </button>
    </div>
  );
}
