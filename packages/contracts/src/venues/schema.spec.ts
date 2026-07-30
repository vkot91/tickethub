import { venueDetailSchema, venueSummarySchema } from './schema';
import { VENUES_MESSAGE_PATTERNS } from './wire';

describe('venues wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(VENUES_MESSAGE_PATTERNS.GET_LIST).toBe('venues.getList');
    expect(VENUES_MESSAGE_PATTERNS.GET_ONE).toBe('venues.getOne');
  });
});

describe('venueSummarySchema', () => {
  it('accepts a hall with no address on file', () => {
    const venue = {
      id: crypto.randomUUID(),
      name: 'Grand Hall',
      address: null,
      city: null,
      seatCount: 120,
    };

    expect(venueSummarySchema.parse(venue)).toEqual(venue);
  });

  it('rejects a fractional seatCount', () => {
    expect(() =>
      venueSummarySchema.parse({
        id: crypto.randomUUID(),
        name: 'Grand Hall',
        address: null,
        city: null,
        seatCount: 1.5,
      }),
    ).toThrow();
  });
});

describe('venueDetailSchema', () => {
  // A venue knows its furniture, not what a show charges for it — the seat shape carries no
  // price, and that omission is the whole point of the type.
  it('accepts nested sections without any pricing', () => {
    const detail = {
      venue: { id: crypto.randomUUID(), name: 'Grand Hall', address: null, city: 'Kyiv' },
      sections: [
        {
          id: crypto.randomUUID(),
          name: 'Stalls',
          rows: [
            {
              id: crypto.randomUUID(),
              number: 1,
              seats: [{ id: crypto.randomUUID(), number: 1 }],
            },
          ],
        },
      ],
    };

    expect(venueDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a seat that smuggles in a price', () => {
    const withPrice = {
      venue: { id: crypto.randomUUID(), name: 'Grand Hall', address: null, city: null },
      sections: [
        {
          id: crypto.randomUUID(),
          name: 'Stalls',
          rows: [
            {
              id: crypto.randomUUID(),
              number: 1,
              seats: [{ id: crypto.randomUUID(), number: 1, priceCents: 500 }],
            },
          ],
        },
      ],
    };

    // Zod strips unknown keys rather than throwing, so the assertion is that the price is gone.
    expect(venueDetailSchema.parse(withPrice).sections[0].rows[0].seats[0]).not.toHaveProperty(
      'priceCents',
    );
  });
});
