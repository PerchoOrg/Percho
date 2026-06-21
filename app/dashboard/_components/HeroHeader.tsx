/**
 * HeroHeader — 3-section hero for the agent listing detail page (Phase 47.5).
 *
 * Replaces the older HubDetailShell hero block. Uses CSS grid with three
 * explicit rows:
 *   Row 1: controls (right-aligned)  — chromeless buttons + StatusPill + ⋯
 *   Row 2: home info (1fr, left-aligned, vertically centered) — title + subtitle
 *   Row 3: stats (3 frosted glass tiles, full-width) — Views / Saves / Leads
 *
 * No `position: absolute`. Physical separation, zero overlap risk regardless
 * of address length.
 *
 * The component is server-renderable; interactive children (StatusPill,
 * ListingDetailMenu) are passed in as `controls`. Stats are passed in as
 * data, not children, so the SSR fetch in the parent page can drive them.
 */
import type { ReactNode } from 'react';

export type HeroStat = {
  label: string;
  value: number | string;
  delta?: string;
};

type Props = {
  coverUrl: string | null;
  title: string;
  subtitle?: string;
  /** Right-aligned control row (Preview button, StatusPill, menu). */
  controls?: ReactNode;
  /** Three glass tiles at the bottom of the hero. Pass [] to hide. */
  stats?: HeroStat[];
};

export function HeroHeader({ coverUrl, title, subtitle, controls, stats }: Props) {
  const showStats = stats && stats.length > 0;

  return (
    <header className="mx-auto max-w-6xl">
      <div
        className="relative grid w-full overflow-hidden bg-surface sm:rounded-b-xl"
        style={{
          aspectRatio: '5 / 2',
          gridTemplateRows: 'auto 1fr auto',
          padding: '12px 18px',
        }}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted text-xs">
            No cover image yet
          </div>
        )}
        {/* Scrim — keeps chromeless white text legible on bright covers. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent 22%, transparent 60%, rgba(0,0,0,0.55))',
          }}
        />

        {/* §1 — controls (top, right) */}
        <div className="relative z-10 flex items-center justify-end gap-1">
          {controls}
        </div>

        {/* §2 — home info (middle, left) */}
        <div className="relative z-10 flex flex-col justify-center text-surface">
          <h1
            className="font-serif font-semibold text-2xl leading-tight drop-shadow sm:text-3xl"
            style={{ letterSpacing: '-0.01em' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-surface/90 drop-shadow">{subtitle}</p>
          )}
        </div>

        {/* §3 — stats (bottom, full width, 3 frosted tiles) */}
        {showStats && (
          <div className="relative z-10 grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-[10px] border px-3 py-2 text-surface"
                style={{
                  background: 'rgba(251, 248, 243, 0.18)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  borderColor: 'rgba(255,255,255,0.22)',
                }}
              >
                <div className="text-[10px] uppercase tracking-[0.07em] opacity-75">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-1.5 font-serif text-[22px] leading-none">
                  <span>{s.value}</span>
                  {s.delta && (
                    <span className="font-sans text-[11px] opacity-85">{s.delta}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
