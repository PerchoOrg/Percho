/**
 * WorkspaceSubNav — chips row that sits under the page heading on the agent's
 * three workspace surfaces (Listings / Communities / Leads).
 *
 * Phase 36.2 (2026-06-18). The bottom-nav "Workspace" tab lands on /dashboard
 * (listings view). Once an agent has listings, the onboarding empty-state CTA
 * cards no longer render, which leaves /dashboard/communities and
 * /dashboard/leads with no in-app mobile entry. Tianrou flagged the
 * communities case ("没办法 manage community 了"); leads is the same shape.
 *
 * One chips row, three pages, current page is gold-tinted and non-clickable.
 * Server-renderable — no client interactivity needed.
 */

import Link from 'next/link';

type Section = 'listings' | 'communities' | 'leads';

const SECTIONS: { key: Section; label: string; href: string }[] = [
  { key: 'listings', label: 'Listings', href: '/dashboard' },
  { key: 'communities', label: 'Communities', href: '/dashboard/communities' },
  { key: 'leads', label: 'Leads', href: '/dashboard/leads' },
];

export function WorkspaceSubNav({ active }: { active: Section }) {
  return (
    <nav aria-label="Workspace sections" className="mt-3 flex gap-2 text-xs sm:mt-4 sm:text-sm">
      {SECTIONS.map((s) =>
        s.key === active ? (
          <span
            key={s.key}
            aria-current="page"
            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 font-medium text-gold"
          >
            {s.label}
          </span>
        ) : (
          <Link
            key={s.key}
            href={s.href}
            className="rounded-full border border-cream/15 px-3 py-1.5 text-cream/70 transition hover:border-gold/40 hover:text-cream"
          >
            {s.label}
          </Link>
        ),
      )}
    </nav>
  );
}
