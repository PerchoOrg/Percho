import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ResetPasswordForm } from './reset-password-form';

/**
 * Post-recovery destination. /auth/callback exchanges the recovery code for
 * a session, then redirects here. If the user has no session (e.g. they hit
 * this URL directly), bounce them to /forgot-password.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/forgot-password');
  }

  return <ResetPasswordForm />;
}
