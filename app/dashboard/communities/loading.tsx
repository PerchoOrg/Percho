// instant skeleton for /dashboard/communities so the
// click-through from the dashboard nav doesn't freeze on the server fetch.
// Mirrors the public /communities skeleton so the visual layout is identical
// (same GridPageShell + GridFrame metrics).
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-1 pb-6 md:px-1.5">
      <div className="grid grid-cols-2 gap-1 md:grid-cols-4 md:gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <div key={i} className="aspect-[3/4] animate-pulse bg-surface" />
        ))}
      </div>
    </div>
  );
}
