import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
    searchParams.redirect && searchParams.redirect.startsWith('/') && !searchParams.redirect.startsWith('//')
      ? searchParams.redirect
      : '/dashboard';

  if (user) {
    redirect(safeRedirect);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Vicinity</h1>
        <p className="text-sm text-neutral-500">Agent sign in</p>
      </header>
      {searchParams.error === 'auth_failed' ? (
        <p
          role="alert"
          className="rounded-md px-3 py-2 text-center text-sm"
          style={{
            background: 'rgba(220, 38, 38, 0.1)',
            color: '#fca5a5',
            border: '1px solid rgba(220, 38, 38, 0.3)',
          }}
        >
          That sign-in link was invalid or expired. Try again.
        </p>
      ) : null}
      <LoginForm redirect={safeRedirect} />
    </div>
  );
}
