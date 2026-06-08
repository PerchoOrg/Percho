/**
 * Dashboard home — empty state for V1.
 *
 * Phase 4 replaces this with the real listings index.
 */
export default function DashboardHomePage() {
  return (
    <div className="space-y-2 py-16 text-center">
      <h1 className="text-xl font-semibold">No listings yet</h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Listing creation lands in Phase 4.
      </p>
    </div>
  );
}
