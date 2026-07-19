// Phase 47.2 (2026-06-21): unified grid skeleton — same px / gap / aspect
// as GridPageShell + GridFrame so loading state matches the rendered grid.
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
