'use client';

/**
 * The table's generic building blocks — a header cell, a body cell, a status
 * word and the one button style every cell uses. Nothing here knows what a
 * photo is. Split out of `PhotoTable.tsx` on 2026-09-06.
 */

// Tight padding so ~15 columns fit one screen without a horizontal scroll
// (owner 2026-08-19: "make this a big table to show all columns in one page").
export function Th({
  children,
  className = '',
  hint,
}: {
  children: React.ReactNode;
  className?: string;
  /** One-line gloss under the label — owner 2026-08-19: "give some description
   *  for the column, for example, reframed can mention 2:3?" Fifteen terse
   *  headings ("DA", "KB", "Reframed") do not say what the column IS. */
  hint?: string;
}) {
  return (
    <th className={`px-1.5 py-1.5 align-top font-semibold ${className}`}>
      {/* align-top + a label line of fixed height: with align-bottom, a header
          that has a hint sat lower than one that does not, so the labels
          zig-zagged across the row (owner 2026-08-19: "should be bold and
          aligned in the same horizon"). */}
      <span className="block h-3.5 text-[10px] uppercase tracking-wide">{children}</span>
      {hint && (
        <span className="block font-normal text-[9px] text-ink2/70 normal-case tracking-normal">
          {hint}
        </span>
      )}
    </th>
  );
}

export function Td({
  children,
  className = '',
}: { children: React.ReactNode; className?: string }) {
  return <td className={`px-1.5 py-1.5 ${className}`}>{children}</td>;
}

export function StatusText({ value }: { value: string }) {
  const cls =
    value === 'approved'
      ? 'text-emerald-600'
      : value === 'ready'
        ? 'text-amber-600'
        : value === 'rejected' || value === 'failed'
          ? 'text-red-600'
          : value === 'queued' || value === 'processing'
            ? 'text-blue-600'
            : 'text-ink2';
  return <span className={cls}>{value}</span>;
}

export function MiniBtn({
  label,
  title,
  active,
  danger,
  disabled,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls = active
    ? danger
      ? 'bg-red-500 text-white'
      : 'bg-emerald-500 text-white'
    : 'border border-line bg-bg text-ink2 hover:border-ink2';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium disabled:opacity-40 ${cls}`}
    >
      {label}
    </button>
  );
}
