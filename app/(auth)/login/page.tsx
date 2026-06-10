import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';

type SearchParams = { redirect?: string; error?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeRedirect =
    searchParams.redirect?.startsWith('/') && !searchParams.redirect.startsWith('//')
      ? searchParams.redirect
      : '/dashboard';

  if (user) {
    redirect(safeRedirect);
  }

  return (
    <div className="space-y-5">
      {searchParams.error === 'auth_failed' ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300"
        >
          That sign-in link was invalid or expired. Try again.
        </p>
      ) : null}
      <LoginForm redirect={safeRedirect} />
      <div className="space-y-2 text-center text-sm">
        <p>
          <a href="/forgot-password" className="text-cream/60 underline hover:text-cream">
            Forgot password?
          </a>
        </p>
        <p className="text-cream/60">
          Don&apos;t have an account?{' '}
          <a
            href={`/signup${safeRedirect === '/dashboard' ? '' : `?redirect=${encodeURIComponent(safeRedirect)}`}`}
            className="text-gold underline hover:text-gold/80"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
