/**
 * The sign-in URL that brings the viewer back to `returnTo` afterwards.
 * Used by the actions that need an account — Save and Compare (phase311).
 * The login page runs the value through `safeRedirectPath`.
 */
export function loginHref(returnTo: string): string {
  return `/login?redirect=${encodeURIComponent(returnTo)}`;
}

/** The current page as a `returnTo` value (browser only). */
export function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}
