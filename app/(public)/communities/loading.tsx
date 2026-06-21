export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-ink2/20" />
        <div className="h-4 w-72 animate-pulse rounded bg-ink2/15" />
        <ul className="mt-6 grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <li key={i} className="aspect-[3/4] animate-pulse bg-surface" />
          ))}
        </ul>
      </div>
    </div>
  );
}
