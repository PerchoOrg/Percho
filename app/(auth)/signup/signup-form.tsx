'use client';

import { createClient } from '@/lib/supabase/client';
import { SignupWithPassword } from '@/lib/zod/auth';
import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none disabled:opacity-50';

export function SignupForm({ redirect }: { redirect: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const parsed = SignupWithPassword.safeParse({ email, password, confirm });
    if (!parsed.success) {
      setStatus('error');
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const supabase = createClient();
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('redirect', redirect);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: callback.toString() },
    });

    if (signUpError) {
      setStatus('error');
      setError(signUpError.message);
      return;
    }

    // With email confirmation OFF (internal beta), Supabase returns a session
    // immediately and the user is logged in. With it ON (post-GA), `session`
    // is null and we show the confirm-email screen.
    if (data.session) {
      window.location.assign(redirect);
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-white/5 bg-ink2/60 p-8 text-center">
        <h1 className="font-serif text-2xl text-cream">Check your inbox</h1>
        <p className="mt-3 text-sm text-cream/70">
          We sent a confirmation link to <span className="text-gold">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-ink2/60 p-8">
      <h1 className="font-serif text-3xl text-cream">Create account</h1>
      <p className="mt-1 text-sm text-cream/50">Start listing in minutes.</p>
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
      <label className="mt-4 block">
        <span className="text-xs text-cream/60">Password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={status === 'sending'}
          className={inputCls}
          placeholder="At least 8 characters"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs text-cream/60">Confirm password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={status === 'sending'}
          className={inputCls}
          placeholder="Re-enter password"
        />
      </label>
      <button
        type="submit"
        disabled={
          status === 'sending' ||
          email.length === 0 ||
          password.length === 0 ||
          confirm.length === 0
        }
        className="btn-gold mt-6 w-full rounded-lg py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'sending' ? 'Creating account…' : 'Create account'}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
