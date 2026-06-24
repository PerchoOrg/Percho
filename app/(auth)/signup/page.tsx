import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SignupForm } from './signup-form';

type SearchParams = { redirect?: string };

export default async function SignupPage({
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
      <SignupForm redirect={safeRedirect} />
      <p className="text-center text-sm text-ink2">
        Already have an account?{' '}
        <a
          href={`/login${safeRedirect === '/dashboard' ? '' : `?redirect=${encodeURIComponent(safeRedirect)}`}`}
          className="text-ink underline hover:text-ink/80"
        >
          Log in
        </a>
      </p>
    </div>
  );
}
