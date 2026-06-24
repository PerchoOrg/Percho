/**
 * upload-status-store — module-level pub/sub for prefill upload progress.
 *
 * Phase 50.17 (2026-06-23): the FAB now drops the agent on the community
 * hub Details tab while the queued media auto-uploads via the Media tab
 * (eagerly mounted under HubTabs). The Details tab needs to *show* that
 * upload progress without taking a dependency on the Media component.
 *
 * The store lives on the module — all subscribers within the same SPA
 * mount see the same state. A hard reload clears it; that's fine because
 * the prefill File[] also lives module-level and is gone after reload.
 *
 * Keyed by communityId so two hubs open in different tabs don't bleed.
 */

import { useEffect, useState } from 'react';

export interface UploadStatus {
  /** Total prefill files queued for this community. */
  total: number;
  /** Files reported done by the Media panel. */
  done: number;
  /** Files reported failed by the Media panel. */
  failed: number;
}

type Listener = (s: UploadStatus) => void;

const empty: UploadStatus = { total: 0, done: 0, failed: 0 };
const states = new Map<string, UploadStatus>();
const listeners = new Map<string, Set<Listener>>();

function emit(communityId: string) {
  const subs = listeners.get(communityId);
  if (!subs) return;
  const state = states.get(communityId) ?? empty;
  for (const fn of subs) fn(state);
}

export function setUploadTotal(communityId: string, total: number) {
  states.set(communityId, { total, done: 0, failed: 0 });
  emit(communityId);
}

export function reportUploadDone(communityId: string) {
  const cur = states.get(communityId) ?? empty;
  states.set(communityId, { ...cur, done: cur.done + 1 });
  emit(communityId);
}

export function reportUploadFailed(communityId: string) {
  const cur = states.get(communityId) ?? empty;
  states.set(communityId, { ...cur, failed: cur.failed + 1 });
  emit(communityId);
}

export function clearUploadStatus(communityId: string) {
  states.delete(communityId);
  emit(communityId);
}

/**
 * React hook that subscribes to upload status for a community. Returns
 * the current status object (re-rendered on changes).
 */
export function useUploadStatus(communityId: string): UploadStatus {
  const [state, setState] = useState<UploadStatus>(() => states.get(communityId) ?? empty);

  useEffect(() => {
    const subs = listeners.get(communityId) ?? new Set<Listener>();
    listeners.set(communityId, subs);
    const fn: Listener = (s) => setState(s);
    subs.add(fn);
    // Sync once in case state changed between render and effect.
    setState(states.get(communityId) ?? empty);
    return () => {
      subs.delete(fn);
      if (subs.size === 0) listeners.delete(communityId);
    };
  }, [communityId]);

  return state;
}
