'use client';

import { createClient } from '@/lib/supabase/client';
import { Email } from '@/lib/zod/auth';
import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none disabled:opacity-50';

export function ForgotPasswordForm() {
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
      setError('Enter a valid email');
      return;
    }

    const supabase = createClient();
    // Supabase recovery flow: user clicks the link, lands on /auth/callback
    // which exchanges the code for a session, then redirects to
    // /reset-password where they set a new password via updateUser.
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('redirect', '/reset-password');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: callback.toString(),
    });

    if (resetError) {
      setStatus('error');
      setError(resetError.message);
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-white/5 bg-ink2/60 p-8 text-center">
        <h1 className="font-serif text-2xl text-cream">Check your inbox</h1>
        <p className="mt-3 text-sm text-cream/70">
          If <span className="text-gold">{email}</span> has an account, a reset link is on its way.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setEmail('');
          }}
          className="mt-4 text-sm text-cream/60 underline hover:text-cream"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-ink2/60 p-8">
      <h1 className="font-serif text-3xl text-cream">Reset password</h1>
      <p className="mt-1 text-sm text-cream/50">We&apos;ll email you a reset link.</p>
      <label className="mt-6 block">
        <span className="text-xs text-cream/60">Email</span>
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
        {status === 'sending' ? 'Sending…' : 'Send reset link'}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
