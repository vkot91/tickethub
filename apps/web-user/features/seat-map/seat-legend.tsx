const LEGEND = [
  { label: 'Available', className: 'border-tier-standard/40 bg-seat' },
  { label: 'Selected', className: 'border-accent bg-accent' },
  { label: 'Held by others', className: 'border-warn bg-warn/15' },
  { label: 'Sold', className: 'border-line-faint bg-deep' },
] as const;

export function SeatLegend() {
  return (
    <ul className="mt-6 flex flex-wrap gap-5">
      {LEGEND.map(({ label, className }) => (
        <li key={label} className="flex items-center gap-2 text-xs text-fg-muted">
          <span aria-hidden className={`size-3.5 rounded-sm border ${className}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}
