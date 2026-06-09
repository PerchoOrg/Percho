/**
 * /dashboard/listings/new — create a new draft listing.
 *
 * Server Component: auth-guards, then renders the client form. The form
 * resolves an address via Google Places (server-proxied) and submits to
 * the `createListing` server action, which redirects to the edit page.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewListingForm } from './NewListingForm';

export default async function NewListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fdashboard%2Flistings%2Fnew');

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">New listing</h1>
        <p className="mt-1 text-sm text-cream/60">
          Start with the address. We&apos;ll fill in the city, state, ZIP, and coordinates from
          Google. You can edit everything else on the next screen.
        </p>
      </header>
      <NewListingForm />
    </div>
  );
}
