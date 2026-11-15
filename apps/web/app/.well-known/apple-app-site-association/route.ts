/**
 * iOS universal links (phase335). Apple's CDN fetches this, with no redirect
 * allowed, to learn which paths open the app — see `lib/share/app-links.ts`.
 * The path has a dot in it, so the middleware's matcher never runs here.
 */
import { appleAppSiteAssociation } from '@/lib/share/app-links';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(appleAppSiteAssociation());
}
