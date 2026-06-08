/**
 * TopBar — sticky header for dashboard routes.
 *
 * Visual style mirrors the demo: dark translucent background, gold "V" mark,
 * agent name + brokerage on the right, Sign out as a form POST (no client JS).
 */

type Props = {
  displayName: string;
  brokerage: string | null;
};

export function TopBar({ displayName, brokerage }: Props) {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur"
      style={{
        background: 'rgba(12, 12, 12, 0.72)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold"
            style={{ background: 'var(--brand)', color: '#1a1300' }}
            aria-hidden="true"
          >
            V
          </span>
          <span className="text-base font-semibold tracking-tight">Vicinity</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">{displayName}</div>
            {brokerage ? (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {brokerage}
              </div>
            ) : null}
          </div>
          <form action="/api/auth/signout" method="post">
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
        </div>
      </div>
    </header>
  );
}
