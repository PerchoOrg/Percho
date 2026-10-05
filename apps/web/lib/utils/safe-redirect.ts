/**
 * A `?redirect=` value reduced to a same-origin path, or the fallback.
 *
 * "Starts with `/` and not `//`" is not enough: URL parsing treats `\` as `/`
 * and drops tabs and newlines, so `/\evil.com` and `/<TAB>/evil.com` pass that
 * test and still navigate off-site. Resolving against a throwaway origin and
 * checking the origin survived is the test the browser itself will apply.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw?.startsWith('/')) return fallback;
  const base = 'https://same-origin.invalid';
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
