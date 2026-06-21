'use client';
/**
 * HeroControl — chromeless button used inside HeroHeader Row 1 (Phase 47.5).
 *
 * Default: transparent + text-shadow for legibility on cover photos.
 * Hover: frosted-glass surface (rgba bg + blur + thin border + soft shadow).
 * Active: scale(0.97). Transition 160ms.
 *
 * Use `as="link"` with `href` for the Preview link, or default <button>.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

type CommonProps = {
  children: ReactNode;
  /** Compact icon-only square button (32×32). */
  iconOnly?: boolean;
  className?: string;
  ariaLabel?: string;
};

const baseStyles =
  'inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[12.5px] text-surface transition-all duration-150 hover:border-white/25 hover:bg-white/20 hover:shadow-[0_2px_12px_rgba(0,0,0,0.18)] hover:backdrop-blur-md hover:[text-shadow:none] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60 focus-visible:bg-white/20 focus-visible:border-white/25';

const textShadow = { textShadow: '0 1px 2px rgba(0,0,0,0.55)' } as const;

const iconExtra = 'h-8 w-8 justify-center p-0 text-[15px]';

export function HeroControl({
  children,
  href,
  onClick,
  iconOnly,
  className = '',
  ariaLabel,
  type = 'button',
}: CommonProps & {
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const cls = `${baseStyles}${iconOnly ? ` ${iconExtra}` : ''} ${className}`.trim();
  if (href) {
    return (
      <Link href={href} className={cls} style={textShadow} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button
      // biome-ignore lint/a11y/useButtonType: dynamic via prop
      type={type}
      onClick={onClick}
      className={cls}
      style={textShadow}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
