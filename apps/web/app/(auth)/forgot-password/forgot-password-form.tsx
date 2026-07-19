'use client';

import { createClient } from '@/lib/supabase/client';
import { Email } from '@/lib/zod/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Status = 'idle' | 'sending' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none disabled:opacity-50';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const parsed = Email.safeParse(email);
    if (!parsed.success) {
      setStatus('error');
      setError('Enter a valid email.');
      return;
    }

    const supabase = createClient();
    // Note: we do NOT pass redirectTo here. The Supabase email template should
    // surface {{ .Token }} (a numeric OTP, 6-10 digits) instead of a magic link,
    // user enters that OTP on /reset-password. Link-based fallback still works
    // via /auth/callback if the template includes {{ .ConfirmationURL }}.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data);

    // Anti-enumeration: never disclose whether an email exists. Always advance
    // to the OTP entry step. If the email is unregistered, the OTP they enter
    // will fail at verifyOtp time with a generic "invalid token" error.
    if (resetError) {
      // Still log the error for ourselves — but don't leak to the UI.
      console.error('resetPasswordForEmail error:', resetError.message);
    }

    router.push(`/reset-password?email=${encodeURIComponent(parsed.data)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-8">
      <h1 className="font-serif text-3xl text-ink">Forgot password</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email. We&apos;ll send a 6-digit code to reset your password.
      </p>
      <label className="mt-6 block">
        <span className="text-xs text-ink2">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
          className={inputCls}
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={status === 'sending' || email.length === 0}
        className="btn-gold mt-6 w-full rounded-lg py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending…' : 'Send code'}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
