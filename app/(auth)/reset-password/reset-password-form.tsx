'use client';

import { createClient } from '@/lib/supabase/client';
import { Email, Password } from '@/lib/zod/auth';
import { useState } from 'react';
import { z } from 'zod';

type Status = 'idle' | 'verifying' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-gold focus:outline-none disabled:opacity-50';

const ResetSchema = z
  .object({
    email: Email,
    otp: z.string().regex(/^\d{6,10}$/, 'Enter the verification code from your email'),
    password: Password,
    confirm: Password,
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

export function ResetPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('verifying');
    setError(null);

    const parsed = ResetSchema.safeParse({ email, otp, password, confirm });
    if (!parsed.success) {
      setStatus('error');
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const supabase = createClient();

    // Step 1: verify the OTP. On success Supabase establishes a session.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.otp,
      type: 'recovery',
    });

    if (verifyError) {
      setStatus('error');
      setError('Invalid or expired code. Request a new one and try again.');
      return;
    }

    // Step 2: with a live session, update the password.
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
      <h1 className="font-serif text-3xl text-cream">Reset password</h1>
      <p className="mt-1 text-sm text-cream/50">
        Enter the 6-digit code from your email and choose a new password.
      </p>
      <label className="mt-6 block">
        <span className="text-xs text-cream/60">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'verifying'}
          className={inputCls}
          placeholder="you@example.com"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs text-cream/60">Verification code</span>
        <input
          type="text"
          inputMode="numeric"
          required
          autoComplete="one-time-code"
          maxLength={10}
          pattern="\d{6,10}"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
          disabled={status === 'verifying'}
          className={`${inputCls} tracking-[0.4em]`}
          placeholder="From your email"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-xs text-cream/60">New password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={status === 'verifying'}
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
          disabled={status === 'verifying'}
          className={inputCls}
          placeholder="••••••••"
        />
      </label>
      <button
        type="submit"
        disabled={
          status === 'verifying' ||
          email.length === 0 ||
          otp.length < 6 ||
          password.length === 0 ||
          confirm.length === 0
        }
        className="btn-gold mt-6 w-full rounded-lg py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'verifying' ? 'Verifying…' : 'Reset password'}
      </button>
      <p className="mt-4 text-xs text-cream/40">
        Didn&apos;t get a code?{' '}
        <a href="/forgot-password" className="text-gold hover:underline">
          Request a new one
        </a>
        .
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
