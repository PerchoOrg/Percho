/**
 * Client-side event tracker for the public listing feed.
 *
 * In-memory queue + 5s flush interval + flush on `pagehide` / `visibilitychange:hidden`.
 * Uses `navigator.sendBeacon` (mobile-correct — `beforeunload` does not fire on iOS),
 * with a `fetch` + `keepalive` fallback for browsers that lack sendBeacon.
 *
 * Events match the existing schema in `supabase/migrations/0001_init.sql`:
 *   event_type:   page_view | card_view | video_complete
 *   listing_id:   uuid of the listing being viewed
 *   card_id:      FeedCard.id (text)
 *   session_id:   sessionStorage-backed UUID, per-tab
 *   meta:         optional jsonb (e.g. { card_index, source: 'listing'|'community' })
 *
 * Fire-and-forget by design. Failures are swallowed — analytics must never
 * block UX.
 */

/**
 * events now attribute to either a listing or a
 * community (not both). Caller MUST set exactly one of `listing_id` /
 * `community_id`. The server route enforces the same shape; emitting
 * both gets the batch rejected.
 */
export type EventInput = {
  event_type: 'page_view' | 'card_view' | 'video_complete';
  card_id?: string;
  meta?: Record<string, unknown>;
} & ({ listing_id: string; community_id?: never } | { community_id: string; listing_id?: never });

type QueuedEvent = EventInput & { session_id: string };

const SESSION_KEY = 'percho_session_id';
const ENDPOINT = '/api/events';
const FLUSH_INTERVAL_MS = 5000;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let listenersAttached = false;

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      // crypto.randomUUID is widely supported in modern browsers; fallback to a
      // timestamp+random string if not.
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (Safari private mode, etc.) — generate ephemeral.
    return `ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  const body = JSON.stringify({ events: batch });

  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
      // sendBeacon refused (size cap, etc.) — fall through to fetch.
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Drop on failure — analytics must not error.
    });
  } catch {
    // Drop.
  }
}

function ensureListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  // pagehide fires on iOS where beforeunload does not.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export function track(event: EventInput): void {
  if (typeof window === 'undefined') return;
  ensureListeners();
  queue.push({ ...event, session_id: getSessionId() });
}

/** Test-only: drain the queue without sending. Not exported via index. */
export function _resetForTests(): void {
  queue = [];
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  listenersAttached = false;
}
