/**
 * Server-side reader/writer for the BGM state sidecar
 * (Storage object `bgm/_state/state.json`).
 *
 * Kept in Storage instead of a Supabase table because:
 *   - only two consumers (admin UI, render-worker sync script)
 *   - no relational queries needed
 *   - render worker can fetch it with one anon GET, no auth wiring
 *
 * Concurrent-writer note: two admins clicking reject at the same time
 * could clobber each other's list. Acceptable for a single-operator tool —
 * revisit if BGM curation ever has more than one hand on the wheel.
 */

import { BGM_BUCKET, BGM_STATE_PATH, type BgmState, emptyBgmState } from '@/lib/bgm/storage';
import { createServiceClient } from '@/lib/supabase/server';

export async function readBgmState(): Promise<BgmState> {
  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(BGM_BUCKET).download(BGM_STATE_PATH);
  if (error || !data) return emptyBgmState();
  try {
    const parsed = JSON.parse(await data.text()) as Partial<BgmState>;
    return {
      schema_version: 1,
      rejected: Array.isArray(parsed.rejected) ? parsed.rejected.filter((s) => typeof s === 'string') : [],
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : new Date().toISOString(),
    };
  } catch {
    return emptyBgmState();
  }
}

export async function writeBgmState(state: BgmState): Promise<void> {
  const svc = createServiceClient();
  const body = JSON.stringify(
    { ...state, updated_at: new Date().toISOString() },
    null,
    2,
  );
  const { error } = await svc.storage
    .from(BGM_BUCKET)
    .upload(BGM_STATE_PATH, new Blob([body], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw new Error(`bgm state write failed: ${error.message}`);
}
