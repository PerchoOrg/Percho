'use client';

/**
 * "Sign in with Google" (phase314) — Supabase's Google OAuth redirect, landing
 * on `/auth/callback`, which exchanges the code and picks where to go.
 *
 * A Google sign-up creates a BUYER (`handle_new_user` defaults a missing role);
 * an agent signs up with email + password, where the role picker is.
 *
 * Drawn to Google's branding rules: white, a grey outline, the full-colour G.
 * Sits UNDER the email form, after an "or" (owner 2026-11-14: "Sign in with
 * Google 放到登录框下面").
 */
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export function GoogleButton({
  redirect,
  label,
}: {
  /** Where to land afterwards; already passed through `safeRedirectPath`. */
  redirect: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('redirect', redirect);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });
    // Success navigates away to Google; only a failure lands here.
    if (oauthError) {
      setBusy(false);
      setError(oauthError.message);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3 text-muted text-xs">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white py-3 font-medium text-[#1F1F1F] text-sm transition hover:bg-[#f8f9fa] disabled:opacity-60"
      >
        <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        {busy ? 'Opening Google…' : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-red-400 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
