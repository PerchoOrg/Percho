/**
 * Anonymous buyer device identifier (Phase 21, 2026-06-13).
 *
 * V1 has no buyer auth — saves are scoped to a per-browser UUID stored
 * in localStorage. When buyer login ships (Phase 22+), a successful
 * login server-action will associate the existing device_id rows with
 * the new user_id, preserving saves across devices from then on.
 *
 * Caveats user is aware of:
 *   - Different browsers / Incognito / clearing site data → fresh id,
 *     prior saves not visible.
 *   - localStorage requires `window`; SSR callers MUST guard.
 */

const STORAGE_KEY = 'vicinity_device_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns the existing device id, or generates+stores a new one.
 * MUST be called from client code only (uses `localStorage`).
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    throw new Error('getOrCreateDeviceId() called server-side');
  }
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage disabled (private mode in some browsers, embedded
    // contexts). Fall back to an in-memory id; saves won't persist
    // across reloads but UI still works.
  }
  if (id && UUID_RE.test(id)) return id;

  const fresh =
    globalThis.crypto?.randomUUID?.() ??
    // RFC4122 v4 fallback for older browsers.
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  try {
    window.localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    /* fall through — best-effort */
  }
  return fresh;
}

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
