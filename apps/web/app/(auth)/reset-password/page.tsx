import { ResetPasswordForm } from './reset-password-form';

type Search = Promise<{ email?: string }>;

/**
 * OTP-based password reset:
 * 1. /forgot-password POSTs the email to Supabase, which sends a 6-digit code.
 * 2. The user lands here (no session yet) and enters: email + OTP + new password.
 * 3. Form calls verifyOtp({ type: 'recovery' }) → session, then updateUser({ password }).
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Search }) {
  const { email } = await searchParams;
  return <ResetPasswordForm initialEmail={email ?? ''} />;
}
