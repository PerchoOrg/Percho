export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="space-y-3">
        <div className="h-7 w-40 animate-pulse rounded bg-ink2/20" />
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <li key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-surface ring-1 ring-line" />
          ))}
        </ul>
      </div>
    </div>
  );
}
