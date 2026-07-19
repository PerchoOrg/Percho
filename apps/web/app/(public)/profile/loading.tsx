/**
 * Generic dark-themed page skeleton — for routes that don't justify a
 * bespoke skeleton. Renders a centered spinner-style pulse. Critical job
 * is just to swap the previous route off-screen the moment a click lands,
 * so users feel the click registered.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-ink2/20" />
        <div className="h-4 w-72 animate-pulse rounded bg-ink2/15" />
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <div key={i} className="h-32 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
