/**
 * Suspense skeleton for /c/[slug]. Phase 47.2: hero kept at original ratio,
 * grid uses unified px-1 md:px-1.5 + gap-1 md:gap-1.5 + 3:4 cards.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="relative aspect-[5/2] w-full animate-pulse bg-surface md:aspect-[5/1] sm:rounded-b-xl">
        <div className="absolute inset-x-0 bottom-0 px-4 py-3 sm:px-6 sm:py-4">
          <div className="h-7 w-2/3 rounded bg-ink2/20" />
          <div className="mt-2 h-4 w-1/3 rounded bg-ink2/20" />
        </div>
      </div>

      <div className="px-1 py-4 md:px-1.5">
        <div className="grid grid-cols-2 gap-1 md:grid-cols-4 md:gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <div key={i} className="aspect-[3/4] animate-pulse bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
