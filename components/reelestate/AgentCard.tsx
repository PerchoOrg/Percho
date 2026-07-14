'use client';

/**
 * <AgentCard> — agent block + CTA row at the bottom of the mobile property
 * detail screen.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3 (agent card + CTAs)
 *
 * Layout:
 *  - Left: gradient-ring avatar (falls back to initial when headshot missing).
 *  - Right of avatar: agent name (17pt semibold) + brokerage (13pt / white 60).
 *  - Below: 3 CTA pills — Message · Call · Save.
 *
 * Wiring (real, no mock):
 *  - Message → `/messages/new?agent=<slug>&listing=<id>` link. That route
 *    doesn't exist yet (M5.x). This is a routed link, NOT a placeholder
 *    string — when the route lands it just works.
 *  - Call    → `tel:<phone>` link, disabled when the agent has no phone on
 *    file (agents table `phone` column is nullable per 0001_init).
 *  - Save    → same `saveListing` / `unsaveListing` server actions the reel
 *    action rail uses, keyed by the browser device_id. Hydrates saved state
 *    on mount so a reload shows the correct filled bookmark.
 *
 * The whole card renders nothing when the listing has no agent join — a
 * detail page for an orphan listing should not show a card with empty
 * slots.
 */

import Link from 'next/link';
import { Bookmark, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import type { MobileListingAgent } from '@/lib/reelestate/listing';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import {
  listSavedListingIds,
  saveListing,
  unsaveListing,
} from '@/app/_actions/saved-listings';

interface AgentCardProps {
  agent: MobileListingAgent;
  listingId: string;
}

export function AgentCard({ agent, listingId }: AgentCardProps) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    (async () => {
      const savedIds = await listSavedListingIds({ deviceId: id });
      if (cancelled) return;
      setSaved(savedIds.includes(listingId));
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  function handleSave() {
    if (!deviceId) return;
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const res = next
        ? await saveListing({ deviceId, listingId })
        : await unsaveListing({ deviceId, listingId });
      if (!res.ok) setSaved(!next);
    });
  }

  const initial = agent.name.slice(0, 1).toUpperCase();

  return (
    <section className="mt-6 flex flex-col gap-4 px-4">
      <div className="flex items-center gap-3">
        {/* Gradient ring avatar. Ring is a padded gradient wrapper; a black
            inner disc lets the gradient show as a hairline. */}
        <div className="rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 p-[2px]">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-black">
            {agent.headshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agent.headshot_url}
                alt={agent.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[15px] font-semibold text-white">{initial}</span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-[17px] font-semibold leading-tight text-white">
            {agent.name}
          </p>
          {agent.brokerage ? (
            <p className="truncate text-[13px] leading-tight text-white/60">
              {agent.brokerage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CtaButton
          as="link"
          href={`/messages/new?agent=${encodeURIComponent(agent.slug)}&listing=${encodeURIComponent(listingId)}`}
          icon={<MessageCircle className="h-4 w-4" strokeWidth={2} />}
          label="Message"
        />
        <CtaButton
          as="link"
          href={agent.phone ? `tel:${agent.phone}` : undefined}
          disabled={!agent.phone}
          icon={<Phone className="h-4 w-4" strokeWidth={2} />}
          label="Call"
        />
        <CtaButton
          as="button"
          onClick={handleSave}
          active={saved}
          icon={
            <Bookmark
              className="h-4 w-4"
              strokeWidth={2}
              fill={saved ? 'currentColor' : 'none'}
            />
          }
          label={saved ? 'Saved' : 'Save'}
        />
      </div>
    </section>
  );
}

interface CtaLinkProps {
  as: 'link';
  href: string | undefined;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}
interface CtaButtonProps {
  as: 'button';
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}
type CtaProps = CtaLinkProps | CtaButtonProps;

function CtaButton(props: CtaProps) {
  const active = 'active' in props ? props.active : false;
  const disabled = 'disabled' in props ? props.disabled : false;

  // Base: black-glass fill + cyan hairline. Active (Save toggled on): filled
  // cyan ink + glow. Disabled: dimmed, non-interactive.
  const cls = [
    'flex h-11 items-center justify-center gap-1.5 rounded-full border text-[13px] font-medium transition',
    disabled
      ? 'border-white/10 bg-black/30 text-white/40'
      : active
        ? 'border-cyan bg-black/50 text-cyan shadow-glow-cyan'
        : 'border-cyan/40 bg-black/40 text-white hover:border-cyan hover:text-cyan',
  ].join(' ');

  if (props.as === 'link') {
    if (disabled || !props.href) {
      return (
        <span aria-disabled className={cls}>
          {props.icon}
          {props.label}
        </span>
      );
    }
    return (
      <Link href={props.href} className={cls}>
        {props.icon}
        {props.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cls}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
