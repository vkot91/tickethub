import { type SeatMap, type SeatTier } from '@tickethub/contracts';
import { DEFAULT_TIER } from '@tickethub/ui';

/** What the server knows about a seat. `selected` is client state and never appears here. */
export type SeatStatus = 'available' | 'held' | 'sold';

export interface SeatView {
  id: string;
  number: number;
  label: string;
  status: SeatStatus;
  tier: SeatTier;
  priceCents: number;
  /** Null when the show has no price band — such a seat cannot be ordered. */
  bandId: string | null;
}

export interface RowView {
  id: string;
  letter: string;
  tier: SeatTier;
  priceCents: number;
  left: SeatView[];
  right: SeatView[];
}

export interface SectionView {
  id: string;
  name: string;
  rows: RowView[];
}

export const MAX_SEATS = 8;

export function rowLetter(rowNumber: number): string {
  return String.fromCharCode(64 + rowNumber);
}

/**
 * Turns the contract's geometry into something renderable: row letters and the centre aisle.
 * Tier and price are carried straight through from the endpoint — both come from the ticket
 * type covering the seat's section, and the UI invents neither.
 *
 * `statuses` is the live availability layer. The seat-map endpoint does not return it yet
 * (BACKEND-GAPS.md §2), so an absent entry means available — which is also exactly the
 * behaviour we want once it does arrive and simply omits free seats.
 */
export function toSeatMapView(
  seatMap: SeatMap,
  statuses: Record<string, SeatStatus> = {},
): SectionView[] {
  return seatMap.sections.map((section) => ({
    id: section.id,
    name: section.name,
    rows: section.rows.map((row) => {
      const letter = rowLetter(row.number);

      const seats: SeatView[] = row.seats.map((seat) => ({
        id: seat.id,
        number: seat.number,
        label: `${letter}${seat.number}`,
        status: statuses[seat.id] ?? 'available',
        tier: seat.tier ?? DEFAULT_TIER,
        // What orders will charge. A seat with no price band is not on sale, so it adds
        // nothing to the running total — `orderSeats()` refuses to submit it either.
        priceCents: seat.priceCents ?? 0,
        bandId: seat.bandId,
      }));

      const aisleAt = Math.ceil(seats.length / 2);

      return {
        id: row.id,
        letter,
        // The row label quotes the band and price of the seats in it — one price band covers
        // the whole section, so any seat in the row answers for all of them.
        tier: seats[0]?.tier ?? DEFAULT_TIER,
        priceCents: seats[0]?.priceCents ?? 0,
        left: seats.slice(0, aisleAt),
        right: seats.slice(aisleAt),
      };
    }),
  }));
}

export function findSeats(sections: SectionView[], seatIds: Iterable<string>): SeatView[] {
  const wanted = new Set(seatIds);
  const found: SeatView[] = [];

  for (const section of sections) {
    for (const row of section.rows) {
      for (const seat of [...row.left, ...row.right]) {
        if (wanted.has(seat.id)) found.push(seat);
      }
    }
  }

  return found;
}

export function totalCents(seats: SeatView[]): number {
  return seats.reduce((sum, seat) => sum + seat.priceCents, 0);
}
