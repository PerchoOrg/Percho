'use client';

import { createClient } from '@/lib/supabase/client';
import { Password } from '@/lib/zod/auth';
import { useState } from 'react';
import { z } from 'zod';

type Status = 'idle' | 'saving' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none disabled:opacity-50';

const ResetSchema = z
  .object({ password: Password, confirm: Password })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setError(null);

    const parsed = ResetSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setStatus('error');
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (updateError) {
      setStatus('error');
      setError(updateError.message);
      return;
    }

    // Force a full reload so server components see the refreshed session.
    window.location.assign('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-ink2/60 p-8">
      <h1 className="font-serif text-3xl text-cream">New password</h1>
      <p className="mt-1 text-sm text-cream/50">Set a new password for your account.</p>
      <label className="mt-6 block">
        <span className="text-xs text-cream/60">New password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={status === 'saving'}
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
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={status === 'saving'}
          className={inputCls}
          placeholder="••••••••"
        />
      </label>
      <button
        type="submit"
        disabled={status === 'saving' || password.length === 0 || confirm.length === 0}
        className="btn-gold mt-6 w-full rounded-lg py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'saving' ? 'Saving…' : 'Save new password'}
      </button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
