'use client';

import { createClient } from '@/lib/supabase/client';
import { SignupWithPassword } from '@/lib/zod/auth';
import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';
type Role = 'agent' | 'buyer';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none disabled:opacity-50';

export function SignupForm({ redirect }: { redirect: string }) {
  const [role, setRole] = useState<Role>('buyer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const parsed = SignupWithPassword.safeParse({ email, password, confirm, role });
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
      options: {
        emailRedirectTo: callback.toString(),
        data: { role: parsed.data.role },
      },
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
      // Role-aware default redirect — only override if caller passed the
      // generic '/dashboard' default. An explicit ?redirect=… still wins.
      const target =
        redirect === '/dashboard' && parsed.data.role === 'buyer' ? '/profile' : redirect;
      window.location.assign(target);
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
      <p className="mt-1 text-sm text-cream/50">Join Vicinity in seconds.</p>

      <fieldset className="mt-6">
        <legend className="text-xs text-cream/60">I am a…</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <RoleOption
            label="Homebuyer"
            sub="Browse and save listings"
            selected={role === 'buyer'}
            onSelect={() => setRole('buyer')}
            disabled={status === 'sending'}
          />
          <RoleOption
            label="Agent"
            sub="List properties and get leads"
            selected={role === 'agent'}
            onSelect={() => setRole('agent')}
            disabled={status === 'sending'}
          />
        </div>
      </fieldset>

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

function RoleOption({
  label,
  sub,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-lg border px-3 py-3 text-left text-sm transition disabled:opacity-50 ${
        selected
          ? 'border-gold bg-gold/10 text-cream'
          : 'border-white/10 bg-ink text-cream/80 hover:border-white/30'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 text-xs text-cream/50">{sub}</div>
    </button>
  );
}
