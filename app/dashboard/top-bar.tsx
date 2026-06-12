/**
 * TopBar — sticky header for dashboard routes.
 *
 * Visual style mirrors the demo: dark translucent background, gold "V" mark,
 * agent name + brokerage on the right, Sign out as a form POST (no client JS).
 *
 * Mobile: nav links collapse into a <details> hamburger so Communities /
 * Leads / New listing remain reachable on phones (the demo omits this, but
 * we have an actual multi-page dashboard).
 */

type Props = {
  displayName: string;
  brokerage: string | null;
};

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Home' },
  { href: '/dashboard/listings/new', label: 'New listing' },
  { href: '/dashboard/communities', label: 'Communities' },
  { href: '/dashboard/leads', label: 'Leads' },
];

export function TopBar({ displayName, brokerage }: Props) {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur"
      style={{
        background: 'rgba(12, 12, 12, 0.72)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        {/* Desktop nav */}
        <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Dashboard">
          {NAV_ITEMS.map((it) => (
            <a
              key={it.href}
              href={it.href}
              className="hover:opacity-80"
              style={{ color: 'var(--muted)' }}
            >
              {it.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-medium">{displayName}</div>
            {brokerage ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {brokerage}
              </div>
            ) : null}
          </div>
          <form action="/api/auth/signout" method="post" className="hidden sm:block">
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm transition hover:opacity-80"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              Sign out
            </button>
          </form>

          {/* Mobile hamburger (CSS-only via <details>) */}
          <details className="relative md:hidden">
            <summary
              className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
              aria-label="Open menu"
            >
              <svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
              </svg>
            </summary>
            <div
              className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-md shadow-lg"
              style={{
                background: 'rgba(18, 18, 18, 0.96)',
                border: '1px solid var(--border)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="border-b px-4 py-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="font-medium">{displayName}</div>
                {brokerage ? (
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {brokerage}
                  </div>
                ) : null}
              </div>
              <nav className="flex flex-col py-2 text-sm" aria-label="Mobile dashboard">
                {NAV_ITEMS.map((it) => (
                  <a
                    key={it.href}
                    href={it.href}
                    className="px-4 py-2 hover:opacity-80"
                    style={{ color: 'var(--fg)' }}
                  >
                    {it.label}
                  </a>
                ))}
              </nav>
              <form
                action="/api/auth/signout"
                method="post"
                className="border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  type="submit"
                  className="block w-full px-4 py-3 text-left text-sm hover:opacity-80"
                  style={{ color: 'var(--muted)' }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
