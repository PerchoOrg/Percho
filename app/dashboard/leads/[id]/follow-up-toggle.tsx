'use client';

/**
 * FollowUpToggle — client island on the lead detail page.
 *
 * Shows "Mark as followed up" when null, "Mark as new" when set. Optimistic
 * update; on failure, refresh from server.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function FollowUpToggle({
  leadId,
  initialFollowedUpAt,
}: {
  leadId: string;
  initialFollowedUpAt: string | null;
}) {
  const router = useRouter();
  const [followedUpAt, setFollowedUpAt] = useState<string | null>(initialFollowedUpAt);
  const [pending, startTransition] = useTransition();

  const onClick = async () => {
    const next = followedUpAt ? null : 'now';
    const optimistic = next === 'now' ? new Date().toISOString() : null;
    setFollowedUpAt(optimistic);
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) {
        setFollowedUpAt(initialFollowedUpAt);
        return;
      }
      const data = (await res.json()) as { followed_up_at: string | null };
      setFollowedUpAt(data.followed_up_at);
      startTransition(() => router.refresh());
    } catch {
      setFollowedUpAt(initialFollowedUpAt);
    }
  };

  const label = followedUpAt ? '↺ Mark as new' : '✓ Mark as followed up';
  const cls = followedUpAt
    ? 'border-cream/20 text-cream/70 hover:border-gold hover:text-gold'
    : 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/20';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded border px-4 py-2 text-sm transition disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
