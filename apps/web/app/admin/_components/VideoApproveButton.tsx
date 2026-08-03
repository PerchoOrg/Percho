'use client';

/**
 * VideoApproveButton — the buyer-facing gate for a rendered video.
 *
 * `status='ready'` only means Cloudflare finished encoding. `approved_at` is the
 * separate, admin-owned decision that lets the mobile feed (Expo Go) serve it.
 * Two columns because the CF webhook writes `status` and would clobber a
 * combined field on any re-encode.
 */

import { setVideoApproval } from '@/lib/poi/admin-enhance-actions';
import { Check, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function VideoApproveButton({
  table,
  videoId,
  approved,
  disabled,
}: {
  table: 'listing_videos' | 'community_videos' | 'generated_videos';
  videoId: string;
  approved: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setPending(true);
    setError(null);
    void (async () => {
      const res = await setVideoApproval(table, videoId, !approved);
      if (!res.ok) setError(res.message);
      setPending(false);
      router.refresh();
    })();
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending || disabled}
        className={`flex w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
          approved
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'border border-line bg-bg text-ink hover:border-ink2'
        }`}
      >
        {approved ? <Undo2 size={13} /> : <Check size={13} />}
        {approved ? 'Approved — unapprove' : 'Approve for app'}
      </button>
      {error && <div className="text-[11px] text-red-600">{error}</div>}
    </div>
  );
}
