/**
 * Suspense skeleton for /c/[slug]. Renders instantly on click while the
 * server fetches the community + videos + listing count. Without this,
 * Next.js shows the previous route until SSR completes — which feels
 * like a 1-3s freeze on slower links.
 *
 * Skeleton mirrors the page's hero (21:9 banner) and the 4-column thumb
 * grid so layout doesn't shift when real content arrives.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero banner skeleton */}
      <div className="relative aspect-[21/9] w-full animate-pulse bg-surface sm:rounded-b-xl">
        <div className="absolute inset-x-0 bottom-0 px-4 py-4 sm:px-6 sm:py-5">
          <div className="h-7 w-2/3 rounded bg-ink2/20" />
          <div className="mt-2 h-4 w-1/3 rounded bg-ink2/20" />
        </div>
      </div>

      <div className="px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="h-6 w-32 animate-pulse rounded-full bg-ink2/20" />
          <div className="h-6 w-32 animate-pulse rounded-full bg-ink2/20" />
        </div>

        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <li key={i}>
              <div className="aspect-[9/16] animate-pulse rounded-lg bg-surface" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
