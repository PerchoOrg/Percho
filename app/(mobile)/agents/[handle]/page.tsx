/**
 * Mobile Agent Profile route — `/agents/[handle]`.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.5
 *
 * A4.1 scope: gradient-ring avatar, name, brokerage, bio. Tabs (Reels |
 * Properties) mount in A4.2; contact CTAs (Message | Call | Website) in
 * A4.3 — both slot below this header on the same page. No mock text; a
 * bad handle 404s, and missing optional fields (brokerage, bio) simply
 * omit their line.
 *
 * Chrome (BottomNav / DesktopSidebar / TopBar) hides on this route via
 * the `/agents/` prefix in `isChromeHidden` — the mobile layout owns its
 * own bottom-nav placeholder.
 */
import { notFound } from 'next/navigation';
import { fetchMobileAgent } from '@/lib/reelestate/agent';

export const dynamic = 'force-dynamic';

interface AgentPageProps {
  params: Promise<{ handle: string }>;
}

export default async function MobileAgentProfilePage({ params }: AgentPageProps) {
  const { handle } = await params;
  const agent = await fetchMobileAgent(handle);
  if (!agent) notFound();

  const initial = agent.name.slice(0, 1).toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 pt-8 pb-8">
      {/* Profile header — gradient-ring avatar centered above the name, the
          same ring recipe the detail-page AgentCard uses (D2.5), sized up
          to 88px for the dedicated profile screen. */}
      <header className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 p-[2px]">
          <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full bg-black">
            {agent.headshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- headshots live on arbitrary Supabase Storage / MLS CDN URLs; not in next/image remote-patterns.
              <img
                src={agent.headshot_url}
                alt={agent.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[28px] font-semibold text-white">{initial}</span>
            )}
          </div>
        </div>

        <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-white">
          {agent.name}
        </h1>
        {agent.brokerage ? (
          <p className="-mt-2 text-[13px] leading-tight text-white/60">
            {agent.brokerage}
          </p>
        ) : null}
      </header>

      {agent.bio ? (
        <p className="mt-5 text-[14px] leading-[22px] text-white/80 whitespace-pre-line">
          {agent.bio}
        </p>
      ) : null}
    </main>
  );
}
