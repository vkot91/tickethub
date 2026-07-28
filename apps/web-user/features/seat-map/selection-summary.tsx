import { X } from 'lucide-react';

import { Button, formatPrice, TIER_LABELS } from '@tickethub/ui';

import { MAX_SEATS, type SeatView, totalCents } from './model';

interface SelectionSummaryProps {
  seats: SeatView[];
  isSubmitting: boolean;
  onRemove: (seat: SeatView) => void;
  onContinue: () => void;
}

/** Sticky bottom bar: the running selection, its total, and the way out to checkout. */
export function SelectionSummary({
  seats,
  isSubmitting,
  onRemove,
  onContinue,
}: SelectionSummaryProps) {
  if (seats.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-seatmap/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-295 flex-wrap items-center gap-4 px-6 py-4">
        <ul className="flex flex-1 flex-wrap gap-2">
          {seats.map((seat) => (
            <li key={seat.id}>
              <button
                type="button"
                onClick={() => onRemove(seat)}
                aria-label={`Remove seat ${seat.label}`}
                className="flex items-center gap-1.5 rounded-pill border border-accent/45 bg-accent/[0.18] py-1.5 pr-2 pl-3 font-mono text-[11px] text-fg hover:border-accent"
              >
                {seat.label}
                <span className="text-fg-muted">· {TIER_LABELS[seat.tier]}</span>
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>

        <div className="text-right">
          <p className="font-mono text-[11px] text-fg-faint">
            {seats.length} of {MAX_SEATS} seats
          </p>
          <p className="font-display text-xl font-semibold">{formatPrice(totalCents(seats))}</p>
        </div>

        <Button onClick={onContinue} disabled={isSubmitting}>
          {isSubmitting ? 'Holding seats…' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
