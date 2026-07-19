'use client';

import { createClient } from '@/lib/supabase/client';
import { LoginWithPassword } from '@/lib/zod/auth';
import { useState } from 'react';

type Status = 'idle' | 'sending' | 'error';

export function LoginForm({ redirect }: { redirect: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const parsed = LoginWithPassword.safeParse({ email, password });
    if (!parsed.success) {
      setStatus('error');
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword(parsed.data);

    if (signInError) {
      setStatus('error');
      // Supabase returns a generic "Invalid login credentials" — keep that
      // verbatim; it's intentionally non-specific to avoid email enumeration.
      setError(signInError.message);
      return;
    }

    // Role-aware default: if caller passed the generic '/dashboard' default
    // and this user has no agents row (they're a buyer), send them to
    // /browse (Explore) instead. An explicit ?redirect=… in the URL always wins.
    let target = redirect;
    if (redirect === '/dashboard' && data.user) {
      const { data: agent } = await supabase
        .from('agents')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (!agent) target = '/browse';
    }

    // Force a full reload so server components observe the new auth cookies.
    window.location.assign(target);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-8">
      <h1 className="font-serif text-3xl text-ink">Login</h1>
      <p className="mt-1 text-sm text-muted">Log in to your account.</p>
      <label className="mt-6 block">
        <span className="text-xs text-ink2">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
          className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none disabled:opacity-50"
          placeholder="you@example.com"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs text-ink2">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={status === 'sending'}
          className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none disabled:opacity-50"
          placeholder="••••••••"
        />
      </label>
      <button
        type="submit"
        disabled={status === 'sending' || email.length === 0 || password.length === 0}
        className="btn-gold mt-6 w-full rounded-lg py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'sending' ? 'Signing in…' : 'Continue'}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
