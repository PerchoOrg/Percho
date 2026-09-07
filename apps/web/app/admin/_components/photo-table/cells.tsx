'use client';

/**
 * The photo table's cells — the ones that know what a photo is.
 *
 * Split out of `PhotoTable.tsx` on 2026-09-06. Imports flow one way:
 * `PhotoTable.tsx` → here → `primitives.tsx` / `row-derivations.ts`.
 */

import { rejectOutpaint, requeueOutpaint } from '@/lib/poi/admin-outpaint-actions';
import { useState } from 'react';
import { MiniBtn, StatusText } from './primitives';
import type { ClipStatus } from './row-derivations';

/**
 * Where a photo came from. Worth a column because provenance changes how the
 * pipeline treats the file: a hand-picked photo from the community's own site
 * outranks a Places photo of the same POI and is exempt from the 2-per-POI cap
 * (owner 2026-08-19), so "why did this one make the cut" is often answered
 * here. The source page is on the title so a doubtful photo can be traced.
 */
export function PhotoSourceBadge({
  source,
  attribution,
}: {
  source?: string | null;
  attribution?: Record<string, unknown> | null;
}) {
  if (source === 'community_site') {
    const page = typeof attribution?.source_page === 'string' ? attribution.source_page : undefined;
    return (
      <span
        title={page ?? 'Community website'}
        className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
      >
        Website
      </span>
    );
  }
  // Google sources get a badge too, not plain grey text (owner 2026-08-19:
  // "use some color for google source as well"). The point of this column is
  // telling the two apart at a glance while scrolling, and only one of them
  // being a chip made the other read as "no source".
  if (source === 'google_streetview') {
    return (
      <span className="inline-block rounded bg-sky-50 px-1.5 py-0.5 font-medium text-[10px] text-sky-700">
        Street View
      </span>
    );
  }
  if (source === 'google_places') {
    return (
      <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 font-medium text-[10px] text-blue-700">
        Google
      </span>
    );
  }
  return <span className="text-[10px] text-ink2">{source ?? '—'}</span>;
}

/**
 * The reframe: the result itself, and how to undo it.
 *
 * Shows the reframed image rather than a link to it (owner 2026-08-19: "show
 * small photos directly in the table"), because this is the one column whose
 * output has to be judged by eye — the model re-renders rather than strictly
 * extends, and a bad result is obvious in a thumbnail and invisible in a
 * status word. Lambert High's aerial came back with the endzone reading
 * LAMBERNS instead of LONGHORNS; nothing but the picture would have caught it.
 *
 * Sized and styled to match the Enhanced column, and taller than it because the
 * output is portrait (owner 2026-08-19: "follow the same Enhanced column, show
 * bigger pictures and remove the text"). The "saved N%" caption that used to sit
 * beside it is gone — it read as a benefit score when it was really just the
 * crop that a centre-cut would have discarded, and the owner asked what it
 * meant. A `ready` reframe is live, so Use crop is the way back.
 */
export function ReframedCell({
  photoId,
  status,
  meta,
  error,
  storageBase,
  bucket,
  path,
  onZoom,
  onChanged,
}: {
  photoId: string;
  status?: string | null;
  meta?: { reason?: string } | null;
  error?: string | null;
  storageBase: string;
  bucket: string;
  path?: string | null;
  onZoom: (url: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!status || status === 'none') return <span className="text-[10px] text-ink2">—</span>;
  if (status === 'skipped') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-ink2">
          {meta?.reason === 'rejected by admin' ? 'discarded' : 'not needed'}
        </span>
        <MiniBtn
          label="Reframe"
          title="Outpaint this photo to the render aspect — costs about $0.09"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await requeueOutpaint(photoId);
            setBusy(false);
            onChanged();
          }}
        />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="text-[10px] text-red-600" title={error ?? undefined}>
        failed
      </div>
    );
  }
  if (status !== 'ready') return <StatusText value={status} />;

  const href = path ? `${storageBase}/storage/v1/object/public/${bucket}/${path}` : null;
  return (
    <div className="flex flex-col gap-1">
      {href && <Thumb src={href} title="Reframed — view full-size" onClick={() => onZoom(href)} />}
      {/* "use crop" / "redo" meant nothing to the person using them (owner
          2026-08-19: "use cropredo - i dont know what is it"). Regenerate is
          the same verb the clip and enhance columns use; Discard says what
          happens rather than naming the thing you fall back to. */}
      <MiniBtn
        label="Regenerate"
        title="Reframe this photo again — costs about $0.09"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await requeueOutpaint(photoId);
          setBusy(false);
          onChanged();
        }}
      />
      <MiniBtn
        label="Discard"
        title="Throw this reframe away and render the original photo instead"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await rejectOutpaint(photoId);
          setBusy(false);
          onChanged();
        }}
      />
    </div>
  );
}

/**
 * ONE thumbnail size for every picture and every clip in the table.
 *
 * Owner 2026-08-19: "all picture and clips should follow the same format." The
 * cells had drifted to four sizes — h-14 w-20 landscape for the source photo,
 * h-16 w-12 for enhanced, h-24 w-14 for reframed, h-24 w-16 for clips — so a
 * row read as four unrelated things rather than one photo at four stages.
 *
 * Portrait at the render canvas's aspect, because that is the shape everything
 * here ends up as: 1080x1576 (see CANVAS_W/CANVAS_H). Landscape sources are
 * cover-cropped into it, which is also what the film does to them.
 */
const THUMB = 'block h-24 w-[66px] shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-line';

/** A still, sized and cropped like every other cell. */
export function Thumb({
  src,
  title,
  onClick,
}: { src: string; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={THUMB} title={title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

/**
 * One clip column: status, a playable poster at the shared size, and a
 * Generate/Regenerate button.
 *
 * Shared by Clip (Seedance), DA (DepthFlow) and KB (Ken Burns) so all three
 * behave and measure identically. They were one column showing whichever of
 * DepthFlow/Ken Burns happened to exist, which hid that a photo can have both
 * and that the one you wanted had failed (owner: "DA, KB — yes split these
 * two").
 */
export function ClipCell({
  clip,
  webClip,
  showEngine,
  poster,
  label,
  canGenerate,
  disabledHint,
  busy,
  onGenerate,
  onPlay,
  onDiscard,
}: {
  clip?: ClipStatus | null;
  /**
   * The same engine's clip on the web canvas, when there is one.
   *
   * Rendered as a second line in this cell rather than a fourth, fifth and
   * sixth column. Undefined on the community tour, which has one canvas.
   */
  webClip?: ClipStatus | null;
  poster: string;
  /** What this column renders, for the button titles: "Seedance", "DepthFlow". */
  label: string;
  canGenerate: boolean;
  /** Show which engine produced the clip. A canvas-keyed column needs it —
   *  the column no longer says. */
  showEngine?: boolean;
  /** Why the button is missing. Rendered in its place — a column that simply
   *  goes blank reads as a bug, not as a rule. */
  disabledHint?: string;
  busy: boolean;
  onGenerate: () => void;
  onPlay: (url: string) => void;
  /** Paid engines only — a local clip is fixed by regenerating, not discarding. */
  onDiscard?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* No status word and no "no clip": the poster's presence says the clip
          is ready, and its absence says it is not (owner 2026-08-19: "remove
          all the text, just show the button, or pic/video with regenerate...
          still keep the time length and cost"). A render still in flight or
          failed is the one case with nothing to look at, so those two keep a
          word. */}
      {clip && clip.status !== 'ready' && (
        <span
          className={
            clip.status === 'failed' ? 'text-[10px] text-red-600' : 'text-[10px] text-ink2'
          }
          title={clip.error ?? undefined}
        >
          {clip.status}
        </span>
      )}
      {clip?.status === 'ready' && clip.video_url && (
        <button
          type="button"
          onClick={() => onPlay(clip.video_url as string)}
          className={`group relative ${THUMB}`}
          title={`Play the ${label} clip`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover opacity-80 transition group-hover:opacity-50"
          />
          <span className="absolute inset-0 flex items-center justify-center text-white text-xl">
            ▶
          </span>
        </button>
      )}
      {showEngine && clip?.engine && <span className="text-[10px] text-ink2">{clip.engine}</span>}
      {clip?.duration_s != null && (
        <span className="text-[10px] text-ink2 tabular-nums">{clip.duration_s}s</span>
      )}
      {clip?.cost_usd != null && (
        <span className="text-[10px] text-ink2 tabular-nums">${clip.cost_usd.toFixed(3)}</span>
      )}
      {!canGenerate && disabledHint && (
        <span className="text-[10px] text-ink2/70" title={disabledHint}>
          hero only
        </span>
      )}
      {canGenerate && (
        <MiniBtn
          label={clip ? 'Regenerate' : 'Generate'}
          title={
            clip
              ? `Re-render this ${label} clip with the current plan`
              : `Generate a ${label} clip from this photo`
          }
          disabled={busy}
          onClick={onGenerate}
        />
      )}
      {onDiscard && clip && clip.status !== 'rejected' && (
        <MiniBtn
          label="Discard"
          title={`Reject this ${label} clip so the tour stops using it`}
          disabled={busy}
          onClick={onDiscard}
        />
      )}
      {/* The web canvas, on one line. No second thumbnail: it is the same
          photo, and two per cell across three columns is exactly the space the
          owner asked back. Status and duration are what differ. */}
      {webClip !== undefined && (
        <div className="mt-1 flex items-center gap-1 border-line border-t pt-1 text-[10px]">
          <span className="text-ink2/60">web</span>
          {webClip === null ? (
            <span className="text-ink2/50">—</span>
          ) : webClip.status === 'ready' && webClip.video_url ? (
            <button
              type="button"
              onClick={() => onPlay(webClip.video_url as string)}
              className="text-ink2 underline hover:text-ink"
              title={`Play the 16:9 ${label} clip`}
            >
              play{webClip.duration_s != null ? ` · ${webClip.duration_s}s` : ''}
            </button>
          ) : (
            <span className={webClip.status === 'failed' ? 'text-red-600' : 'text-ink2'}>
              {webClip.status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
