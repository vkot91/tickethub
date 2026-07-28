import { type SeatMap, type SeatTier } from '@tickethub/contracts';
import { describe, expect, it } from 'vitest';

import { findSeats, rowLetter, type SeatStatus, toSeatMapView, totalCents } from './model';

function seatMapWith(
  rowNumbers: number[],
  seatsPerRow: number,
  seat: { tier?: SeatTier | null; priceCents?: number | null } = {},
): SeatMap {
  const { tier = 'standard', priceCents = 5000 } = seat;

  return {
    showId: 'show-1',
    sections: [
      {
        id: 'section-1',
        name: 'Parterre',
        rows: rowNumbers.map((number) => ({
          id: `row-${number}`,
          number,
          seats: Array.from({ length: seatsPerRow }, (_, index) => ({
            id: `seat-${number}-${index + 1}`,
            number: index + 1,
            ticketTypeId: 'ticket-type-1',
            priceCents,
            tier,
          })),
        })),
      },
    ],
  } as SeatMap;
}

describe('rowLetter', () => {
  it('numbers rows the way the design labels them', () => {
    expect([1, 2, 8].map(rowLetter)).toEqual(['A', 'B', 'H']);
  });
});

describe('tier and price', () => {
  // Both come from the ticket type covering the section. Deriving either from the row number
  // is what this replaced, and it put row 1 of the Balcony in the VIP band.
  it('carries the seat map tier and price straight through', () => {
    const [section] = toSeatMapView(seatMapWith([1, 6], 1, { tier: 'economy', priceCents: 3500 }));

    expect(section.rows.map((row) => row.tier)).toEqual(['economy', 'economy']);
    expect(section.rows.map((row) => row.priceCents)).toEqual([3500, 3500]);
    expect(section.rows[0].left[0].tier).toBe('economy');
    expect(section.rows[0].left[0].priceCents).toBe(3500);
  });

  it('does not band a row by its position', () => {
    const [section] = toSeatMapView(seatMapWith([1], 1, { tier: 'economy' }));

    expect(section.rows[0].tier).toBe('economy'); // row A, and still not VIP
  });

  // A seat no ticket type covers: neutral colour, and nothing added to the running total.
  it('falls back to the neutral band and a zero price when no type covers the seat', () => {
    const [section] = toSeatMapView(seatMapWith([1], 1, { tier: null, priceCents: null }));

    expect(section.rows[0].tier).toBe('standard');
    expect(section.rows[0].left[0].tier).toBe('standard');
    expect(section.rows[0].left[0].priceCents).toBe(0);
  });
});

describe('toSeatMapView', () => {
  it('splits each row at the centre aisle', () => {
    const [section] = toSeatMapView(seatMapWith([1], 14));

    expect(section.rows[0].left).toHaveLength(7);
    expect(section.rows[0].right).toHaveLength(7);
  });

  it('puts the odd seat on the left of an odd-length row', () => {
    const [section] = toSeatMapView(seatMapWith([1], 5));

    expect(section.rows[0].left).toHaveLength(3);
    expect(section.rows[0].right).toHaveLength(2);
  });

  it('labels seats by row letter and number', () => {
    const [section] = toSeatMapView(seatMapWith([3], 2));

    expect(section.rows[0].left[0].label).toBe('C1');
  });

  it('treats a seat with no status entry as available', () => {
    const [section] = toSeatMapView(seatMapWith([1], 2));

    expect(section.rows[0].left.every((seat) => seat.status === 'available')).toBe(true);
  });

  it('applies the live availability layer when it is supplied', () => {
    const statuses: Record<string, SeatStatus> = { 'seat-1-1': 'sold', 'seat-1-2': 'held' };

    const [section] = toSeatMapView(seatMapWith([1], 2), statuses);

    expect(section.rows[0].left.map((seat) => seat.status)).toEqual(['sold']);
    expect(section.rows[0].right.map((seat) => seat.status)).toEqual(['held']);
  });
});

describe('findSeats and totalCents', () => {
  it('finds selected seats across rows and sums their price', () => {
    const sections = toSeatMapView(seatMapWith([1, 6], 2));

    const found = findSeats(sections, ['seat-1-1', 'seat-6-2']);

    expect(found.map((seat) => seat.label)).toEqual(['A1', 'F2']);
    expect(totalCents(found)).toBe(10_000); // two seats at the ticket type's 5000
  });

  it('ignores ids that are not on the map', () => {
    const sections = toSeatMapView(seatMapWith([1], 2));

    expect(findSeats(sections, ['nope'])).toEqual([]);
    expect(totalCents([])).toBe(0);
  });
});
