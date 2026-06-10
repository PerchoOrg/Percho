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
      <SignupForm redirect={safeRedirect} />
      <p className="text-center text-sm text-cream/60">
        Already have an account?{' '}
        <a
          href={`/login${safeRedirect === '/dashboard' ? '' : `?redirect=${encodeURIComponent(safeRedirect)}`}`}
          className="text-gold underline hover:text-gold/80"
        >
          Sign in
        </a>
      </p>
    </div>
  );
}
