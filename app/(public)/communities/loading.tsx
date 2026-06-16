export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-bronze/20" />
        <div className="h-4 w-72 animate-pulse rounded bg-bronze/15" />
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <li key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-ink2 ring-1 ring-bronze/20" />
          ))}
        </ul>
      </div>
    </div>
  );
}
