'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

type MlsOption = 'FMLS' | 'GAMLS' | 'Both' | 'Other';
type Status = 'idle' | 'sending' | 'success' | 'error';

const inputCls =
  'mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-base text-ink placeholder:text-muted focus:border-line-strong focus:outline-none disabled:opacity-50';

const labelCls = 'block text-sm text-ink2';

export function WaitlistForm({ presetEmail }: { presetEmail?: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(presetEmail ?? '');
  const [phone, setPhone] = useState('');
  const [brokerage, setBrokerage] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [mls, setMls] = useState<MlsOption | ''>('');

  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter your full name.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = 'Enter a valid email address.';
    if (!phone.trim()) e.phone = 'Phone is required.';
    if (!brokerage.trim()) e.brokerage = 'Brokerage is required.';
    if (!mls) e.mls_association = 'Please select your MLS.';
    return e;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setStatus('sending');
    try {
      const res = await fetch('/api/agents/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          brokerage: brokerage.trim(),
          license_number: licenseNumber.trim() || undefined,
          mls_association: mls,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus('error');
        setServerError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setServerError('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface p-8 text-center"
      >
        <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden="true" />
        <p className="text-lg text-ink">Thanks — we'll be in touch this week.</p>
        <p className="text-sm text-ink2">
          Keep an eye on your inbox for a dashboard invite (usually 1–2 business days).
        </p>
      </div>
    );
  }

  const disabled = status === 'sending';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <label className="block">
        <span className={labelCls}>Full name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
          autoComplete="name"
          placeholder="Jane Doe"
          className={inputCls}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
      </label>

      <label className="mt-4 block">
        <span className={labelCls}>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          autoComplete="email"
          placeholder="jane@brokerage.com"
          className={inputCls}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email}</p> : null}
      </label>

      <label className="mt-4 block">
        <span className={labelCls}>Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={disabled}
          autoComplete="tel"
          placeholder="(404) 555-0123"
          className={inputCls}
          aria-invalid={Boolean(errors.phone)}
        />
        {errors.phone ? <p className="mt-1 text-xs text-red-600">{errors.phone}</p> : null}
      </label>

      <label className="mt-4 block">
        <span className={labelCls}>Brokerage</span>
        <input
          type="text"
          value={brokerage}
          onChange={(e) => setBrokerage(e.target.value)}
          disabled={disabled}
          autoComplete="organization"
          placeholder="e.g. Keller Williams Atlanta Midtown"
          className={inputCls}
          aria-invalid={Boolean(errors.brokerage)}
        />
        {errors.brokerage ? (
          <p className="mt-1 text-xs text-red-600">{errors.brokerage}</p>
        ) : null}
      </label>

      <label className="mt-4 block">
        <span className={labelCls}>
          License number <span className="text-muted">(optional)</span>
        </span>
        <input
          type="text"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          disabled={disabled}
          placeholder="GA license # (helps us verify faster)"
          className={inputCls}
        />
      </label>

      <label className="mt-4 block">
        <span className={labelCls}>Current MLS association</span>
        <select
          value={mls}
          onChange={(e) => setMls(e.target.value as MlsOption)}
          disabled={disabled}
          className={inputCls}
          aria-invalid={Boolean(errors.mls_association)}
        >
          <option value="">Select one…</option>
          <option value="FMLS">FMLS</option>
          <option value="GAMLS">GAMLS</option>
          <option value="Both">Both</option>
          <option value="Other">Other</option>
        </select>
        {errors.mls_association ? (
          <p className="mt-1 text-xs text-red-600">{errors.mls_association}</p>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={disabled}
        className="btn-gold mt-6 w-full rounded-lg py-3 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? 'Sending…' : 'Sign me up →'}
      </button>

      {serverError ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {serverError}
        </p>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        By signing up you agree to our{' '}
        <a href="/terms" className="underline hover:text-ink">
          terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline hover:text-ink">
          privacy policy
        </a>
        . We'll never sell your info. Unsubscribe anytime.
      </p>
    </form>
  );
}
