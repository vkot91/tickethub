import { cva } from 'class-variance-authority';

import { cn, formatPrice } from '@tickethub/ui';

import { type SeatView } from './model';

/** The seat's four visual states. The tier tint applies only while a seat is still
 *  available — once it is selected, held or sold, the state colour owns the whole seat. */
const seatVariants = cva(
  'size-6.5 rounded-seat border font-mono text-[9px] leading-none transition-transform',
  {
    variants: {
      state: {
        available: 'bg-seat hover:-translate-y-px',
        selected:
          '-translate-y-px border-accent bg-accent text-white shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_30%,transparent)]',
        held: 'animate-hold cursor-not-allowed border-warn bg-warn/15 text-warn',
        sold: 'cursor-not-allowed border-line-faint bg-deep text-fg-disabled',
      },
      tier: { vip: '', standard: '', economy: '' },
    },
    compoundVariants: [
      { state: 'available', tier: 'vip', className: 'border-tier-vip/55 text-tier-vip/90' },
      {
        state: 'available',
        tier: 'standard',
        className: 'border-tier-standard/40 text-tier-standard',
      },
      {
        state: 'available',
        tier: 'economy',
        className: 'border-tier-economy/40 text-tier-economy',
      },
    ],
    defaultVariants: { state: 'available', tier: 'standard' },
  },
);

interface SeatProps {
  seat: SeatView;
  isSelected: boolean;
  onToggle: (seat: SeatView) => void;
}

export function Seat({ seat, isSelected, onToggle }: SeatProps) {
  const state = isSelected ? 'selected' : seat.status;
  const isTaken = seat.status !== 'available';

  return (
    <button
      type="button"
      disabled={isTaken}
      aria-pressed={isSelected}
      aria-label={`Seat ${seat.label}, ${formatPrice(seat.priceCents)}${isTaken ? ', unavailable' : ''}`}
      onClick={() => onToggle(seat)}
      className={cn(seatVariants({ state, tier: seat.tier }))}
    >
      {seat.number}
    </button>
  );
}
