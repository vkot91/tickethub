import { seatMapViewSchema } from './schema';

const seatMap = {
  showId: '00000000-0000-4000-8000-000000000001',
  sections: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Stalls',
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          number: 1,
          seats: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              number: 1,
              bandId: '00000000-0000-4000-8000-000000000005',
              priceCents: 5000,
              tier: 'standard',
            },
          ],
        },
      ],
    },
  ],
};

describe('seatMapViewSchema', () => {
  it('accepts a seat map with a status map', () => {
    const parsed = seatMapViewSchema.parse({
      ...seatMap,
      statuses: { '00000000-0000-4000-8000-000000000004': 'sold' },
    });

    expect(parsed.statuses['00000000-0000-4000-8000-000000000004']).toBe('sold');
  });

  it('accepts an empty status map — every seat is then available', () => {
    expect(seatMapViewSchema.parse({ ...seatMap, statuses: {} }).statuses).toEqual({});
  });

  it('rejects a status the buyer surface does not model', () => {
    expect(() =>
      seatMapViewSchema.parse({
        ...seatMap,
        statuses: { '00000000-0000-4000-8000-000000000004': 'available' },
      }),
    ).toThrow();
  });

  it('rejects a missing status map rather than defaulting it', () => {
    expect(() => seatMapViewSchema.parse(seatMap)).toThrow();
  });
});
