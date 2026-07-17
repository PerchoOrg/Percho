/**
 * /admin — platform-ops root. Redirects the admin to the pipeline hub;
 * non-admins get bounced to their dashboard.
 */

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function AdminIndexPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/dashboard');
  redirect('/admin/pipeline');
}
