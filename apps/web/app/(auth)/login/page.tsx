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
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

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
          <a href="/forgot-password" className="text-ink2 underline hover:text-ink">
            Forgot password?
          </a>
        </p>
        <p className="text-ink2">
          Don&apos;t have an account?{' '}
          <a
            href={`/signup${safeRedirect === '/dashboard' ? '' : `?redirect=${encodeURIComponent(safeRedirect)}`}`}
            className="text-ink underline hover:text-ink/80"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
