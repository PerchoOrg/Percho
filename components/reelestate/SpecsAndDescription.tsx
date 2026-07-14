'use client';

/**
 * SpecsAndDescription — mobile detail specs row + description accordion.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3 (D2.4)
 *
 * Layout:
 *  - Specs row: bed · bath · sqft, dot-separated, matches the canonical
 *    format used elsewhere in ReelEstate (see `ReelCard`).
 *  - Description accordion: `description` is a `string[]` (paragraphs).
 *    Collapsed shows the first paragraph clamped to 3 lines; tapping
 *    "Read more" expands the full list. Purely presentational — no
 *    Supabase writes.
 *
 * Renders nothing if there's neither a spec value nor description text so
 * the parent RSC doesn't have to gate.
 */
import { useState } from 'react';

interface SpecsAndDescriptionProps {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  description: string[];
}

export function SpecsAndDescription({
  beds,
  baths,
  sqft,
  description,
}: SpecsAndDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const specs: string[] = [];
  if (beds != null) specs.push(`${beds} bd`);
  if (baths != null) specs.push(`${baths} ba`);
  if (sqft != null) specs.push(`${sqft.toLocaleString('en-US')} sqft`);

  const paragraphs = description.filter((p) => p.trim().length > 0);
  const hasSpecs = specs.length > 0;
  const hasDescription = paragraphs.length > 0;
  if (!hasSpecs && !hasDescription) return null;

  const canExpand = paragraphs.length > 1 || (paragraphs[0]?.length ?? 0) > 160;

  return (
    <section className="mt-5 flex flex-col gap-4 px-4">
      {hasSpecs ? (
        <ul className="flex items-center gap-2 text-[14px] font-medium text-white/80 tabular-nums">
          {specs.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="h-1 w-1 rounded-full bg-white/30" />
              ) : null}
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasDescription ? (
        <div className="flex flex-col gap-2">
          {expanded ? (
            paragraphs.map((p, i) => (
              <p
                key={i}
                className="text-[14px] leading-relaxed text-white/70"
              >
                {p}
              </p>
            ))
          ) : (
            <p
              className="text-[14px] leading-relaxed text-white/70"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {paragraphs[0]}
            </p>
          )}
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-[13px] font-medium text-cyan-300 hover:text-cyan-200"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
