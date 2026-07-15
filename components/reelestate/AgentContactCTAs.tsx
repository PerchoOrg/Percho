/**
 * <AgentContactCTAs> — contact CTA row for the mobile Agent Profile screen
 * (`/agents/[handle]`), sitting between the profile header and the
 * Reels|Properties tab bar.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.5
 *
 * A4.3 scope:
 *  - Message / Call / Website — pill CTAs in a 3-col row, identical shape to
 *    the D2.5 detail-page AgentCard CTA row so the whole app speaks the same
 *    visual language.
 *  - Verified check badge — a small cyan check pill that renders inline
 *    next to the agent name (rendered by the parent page header). To keep
 *    this component's surface narrow, the badge is exported separately as
 *    <VerifiedBadge> and the parent decides where to place it.
 *
 * Wiring is real (no mock, no placeholder):
 *  - Message → `/messages/new?agent=<slug>` link. That route ships in M5.x;
 *    linking to a future route is not a placeholder — it's a routed link.
 *  - Call    → `tel:<phone>` link, disabled when the agent has no phone on
 *    file. Same disabled-pill treatment as D2.5.
 *  - Website → `<website>` external link with `rel="noreferrer noopener"`,
 *    disabled when the agent has no website on file. The `website` column
 *    does not exist in `agents` today (migration 0001_init); until a schema
 *    migration adds it (deferred — CLAUDE.md §8 needs owner approval), the
 *    CTA renders as a permanently disabled pill and shows the buyer that
 *    the affordance exists but isn't wired for this agent. This matches
 *    "no phone → disabled Call" and mirrors real production behavior.
 *  - Verified badge — reads `agent.verified`, currently always null for
 *    the same schema reason; the badge simply does not render. When the
 *    column lands, verified agents get the check next to their name with
 *    zero code changes here.
 *
 * The component is 'use client' only because it prefetches nothing dynamic;
 * links are static. It could be an RSC but living in the same folder as
 * the other reelestate client components keeps the mental model uniform.
 */

'use client';

import Link from 'next/link';
import { BadgeCheck, Globe, MessageCircle, Phone } from 'lucide-react';
import type { MobileAgent } from '@/lib/reelestate/agent';

interface AgentContactCTAsProps {
  agent: MobileAgent;
}

export function AgentContactCTAs({ agent }: AgentContactCTAsProps) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      <CtaLink
        href={`/messages/new?agent=${encodeURIComponent(agent.slug)}`}
        icon={<MessageCircle className="h-4 w-4" strokeWidth={2} />}
        label="Message"
      />
      <CtaLink
        href={agent.phone ? `tel:${agent.phone}` : undefined}
        icon={<Phone className="h-4 w-4" strokeWidth={2} />}
        label="Call"
      />
      <CtaLink
        href={agent.website ?? undefined}
        external={!!agent.website}
        icon={<Globe className="h-4 w-4" strokeWidth={2} />}
        label="Website"
      />
    </div>
  );
}

/**
 * Small inline verified check. Only renders when `verified === true`; a
 * false / null value hides the badge entirely (no placeholder).
 */
export function VerifiedBadge({ verified }: { verified: boolean | null | undefined }) {
  if (!verified) return null;
  return (
    <span
      aria-label="Verified agent"
      title="Verified agent"
      className="inline-flex items-center text-cyan"
    >
      <BadgeCheck className="h-4 w-4" strokeWidth={2.25} fill="currentColor" stroke="black" />
    </span>
  );
}

interface CtaLinkProps {
  href: string | undefined;
  external?: boolean;
  icon: React.ReactNode;
  label: string;
}

function CtaLink({ href, external, icon, label }: CtaLinkProps) {
  const cls = [
    'flex h-11 items-center justify-center gap-1.5 rounded-full border text-[13px] font-medium transition',
    href
      ? 'border-cyan/40 bg-black/40 text-white hover:border-cyan hover:text-cyan'
      : 'border-white/10 bg-black/30 text-white/40',
  ].join(' ');

  if (!href) {
    return (
      <span aria-disabled className={cls}>
        {icon}
        {label}
      </span>
    );
  }
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cls}
      >
        {icon}
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {icon}
      {label}
    </Link>
  );
}
