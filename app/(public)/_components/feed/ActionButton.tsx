/**
 * .2 — Shared right-rail action button.
 *
 * Extracted verbatim from BrowseFeed.tsx (the canonical implementation).
 * The other two feeds (CommunityVideoFeed, CommunityCarousel) inline their
 * rail buttons today; phases 45.22.4/5 migrate them onto this same component
 * so all three feeds share one button surface.
 *
 * Behavior preserved:
 *   - 12x12 circle, cream/ink palette, backdrop-blur
 *   - 'rose' accent for Like (Xiaohongshu / TikTok convention)
 *   - 'gold' accent (cream-on-cream) for everything else
 *   - optional badge pill (top-right)
 *   - renders <Link> if href is set + not disabled, else <button>
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export function ActionButton({
  onClick,
  href,
  label,
  active,
  activeColor,
  disabled,
  badge,
  badgeColor,
  children,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  active?: boolean;
  /**
   * optional accent for the active state. 'gold' (default) is
   * used by all info actions and Save; 'rose' is used by Like to match
   * Xiaohongshu / TikTok convention.
   */
  activeColor?: 'gold' | 'rose';
  disabled?: boolean;
  badge?: string | number;
  /**
   * optional badge palette. 'cream' (default) matches the
   * original cream-on-ink treatment; 'red' renders as a notification
   * badge (Xiaohongshu/IG/WeChat convention) — used for the neighborhood
   * button's video-count so the number pops as "there's more here".
   */
  badgeColor?: 'cream' | 'red';
  children: ReactNode;
}) {
  const activeCls =
    activeColor === 'rose'
      ? 'border-rose-400/70 bg-rose-400/20 text-rose-400'
      : 'border-cream/40 bg-cream/15 text-cream';
  const cls = `flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
    active
      ? activeCls
      : disabled
        ? 'border-cream/10 bg-ink/30 text-cream/30'
        : 'border-cream/20 bg-ink/40 text-cream hover:border-cream/50'
  }`;
  const badgeCls =
    badgeColor === 'red'
      ? '-right-1 -top-1 absolute rounded-full bg-red-500 px-1.5 py-0.5 font-semibold text-[9px] text-white leading-none tabular-nums'
      : '-right-1 -top-1 absolute rounded-full bg-cream px-1.5 py-0.5 font-semibold text-[9px] text-ink leading-none tabular-nums';
  const inner = (
    <div className="flex flex-col items-center gap-1">
      <span className="relative">
        <span className={cls}>{children}</span>
        {badge ? <span className={badgeCls}>{badge}</span> : null}
      </span>
      <span className="font-medium text-[10px] text-cream/80">{label}</span>
    </div>
  );
  if (href && !disabled) {
    return (
      <Link
        href={href}
        className="block"
        aria-label={label}
        style={{ touchAction: 'manipulation' }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className="block"
      aria-label={label}
      style={{ touchAction: 'manipulation' }}
      disabled={disabled}
    >
      {inner}
    </button>
  );
}
