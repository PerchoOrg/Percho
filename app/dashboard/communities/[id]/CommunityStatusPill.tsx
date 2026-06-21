'use client';

/**
 * CommunityStatusPill — bridge between StatusPill (which takes a server
 * action prop) and the typed community status-actions module. Exists
 * because StatusPill is generic and accepts the action via prop, and
 * we don't want to bake the community import into the listing case.
 */

import { StatusPill } from '@/app/dashboard/_components/StatusPill';
import { setCommunityStatus } from './status-actions';

export function CommunityStatusPill({
  communityId,
  status,
}: {
  communityId: string;
  status: string;
}) {
  return (
    <StatusPill
      id={communityId}
      status={status}
      variant="community"
      setCommunityStatus={setCommunityStatus}
    />
  );
}
