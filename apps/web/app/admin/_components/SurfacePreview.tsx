/**
 * SurfacePreview — one rendered asset, shown at the size its surface shows it.
 *
 * Owner 2026-08-03: "separate videos to view - each in its own size, for example
 * iOS video should show video part of a card (0.618)".
 *
 * A 1:1 asset in a 9:16 admin tile tells you nothing about what the buyer sees.
 * So:
 *   ios -> the 1:1 asset inside a phone-shaped card, occupying HERO_RATIO of its
 *          height, with the panel area blocked out below. That is literally the
 *          feed card's geometry, so what you see here is what ships.
 *   web -> plain 16:9, which is how the web card plays it.
 *
 * HERO_RATIO is duplicated as a literal rather than imported: it lives in
 * `apps/mobile/theme/listing-geometry.ts` and apps/web does not depend on
 * apps/mobile. The test in listing-geometry keeps the mobile side honest; the
 * comment here keeps the pair findable by grep.
 */

import { streamIframeUrl, thumbnailUrl } from '@/lib/cloudflare/stream';

/** Must match HERO_RATIO in apps/mobile/theme/listing-geometry.ts. */
const HERO_RATIO = 0.618;

function safe(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function SurfacePreview({
  surface,
  uid,
  status,
}: {
  surface: 'ios' | 'web';
  uid: string | null;
  status: string;
}) {
  const iframe = uid ? safe(() => streamIframeUrl(uid)) : null;
  const thumb = uid ? safe(() => thumbnailUrl(uid)) : null;

  const label = surface === 'ios' ? 'iOS feed card — 1:1' : 'Web card — 16:9';

  const media = iframe ? (
    <iframe
      src={iframe}
      title={label}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowFullScreen
      className="h-full w-full border-0"
    />
  ) : thumb ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb} alt={label} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-xs text-ink2">
      {uid ? status : 'not rendered'}
    </div>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-ink">{label}</span>
        <span className={uid ? 'text-emerald-600' : 'text-amber-600'}>
          {uid ? 'rendered' : 'missing'}
        </span>
      </div>

      {surface === 'ios' ? (
        // Phone-shaped card. The media block gets HERO_RATIO of the height and
        // the rest is the (blocked-out) content panel — the real card layout.
        <div className="mx-auto w-[220px] overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div className="aspect-[9/16] w-full">
            <div className="flex h-full w-full flex-col">
              <div className="w-full overflow-hidden bg-black/40" style={{ flex: HERO_RATIO }}>
                {media}
              </div>
              <div
                className="flex w-full flex-col justify-center gap-1.5 bg-surface px-3"
                style={{ flex: 1 - HERO_RATIO }}
                aria-hidden
              >
                <div className="h-2 w-3/4 rounded bg-line" />
                <div className="h-2 w-1/2 rounded bg-line" />
                <div className="mt-1 h-6 w-full rounded-full bg-line/70" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-line bg-black/40">
          {media}
        </div>
      )}

      {uid && <div className="font-mono text-[10px] text-muted">{uid.slice(0, 12)}…</div>}
    </div>
  );
}
