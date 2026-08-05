import { catalogPageSchema, catalogQuerySchema, showDetailSchema } from './schema';
import { SHOWS_MESSAGE_PATTERNS } from './wire';

describe('buyer catalog wire names', () => {
  // Unprefixed: the buyer is the default audience. If one of these ever grows an `organizer.`
  // prefix it has moved surface, and that is a different queue.
  it('mirrors each key onto its wire value', () => {
    expect(SHOWS_MESSAGE_PATTERNS.CATALOG).toBe('user.shows.catalog');
    expect(SHOWS_MESSAGE_PATTERNS.DETAIL).toBe('user.shows.detail');
    expect(SHOWS_MESSAGE_PATTERNS.SEAT_MAP).toBe('user.shows.seatMap');
  });
});

describe('catalogQuerySchema', () => {
  it('defaults limit to 20 and coerces a string limit', () => {
    expect(catalogQuerySchema.parse({}).limit).toBe(20);
    expect(catalogQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('rejects a limit above the max', () => {
    expect(() => catalogQuerySchema.parse({ limit: 999 })).toThrow();
  });

  it('rejects a non-uuid cursor', () => {
    expect(() => catalogQuerySchema.parse({ cursor: 'nope' })).toThrow();
  });
});

describe('showDetailSchema', () => {
  it('extends the summary with description, venueId and price tiers', () => {
    const parsed = showDetailSchema.parse({
      id: crypto.randomUUID(),
      title: 'Show',
      startsAt: '2026-01-01',
      posterUrl: null,
      status: 'published',
      description: 'A show',
      venueId: crypto.randomUUID(),
      priceTiers: [
        {
          id: crypto.randomUUID(),
          tier: 'vip',
          name: 'Loge',
          priceCents: 8500,
          currency: 'usd',
        },
      ],
    });

    expect(parsed.description).toBe('A show');
    expect(parsed.priceTiers[0]).toMatchObject({ tier: 'vip', name: 'Loge', priceCents: 8500 });
  });
});

describe('catalogPageSchema', () => {
  it('accepts a page with a null cursor on the last page', () => {
    const parsed = catalogPageSchema.parse({
      items: [
        {
          id: crypto.randomUUID(),
          title: 'Show',
          startsAt: '2026-01-01',
          posterUrl: null,
          status: 'published',
        },
      ],
      nextCursor: null,
    });
    expect(parsed.nextCursor).toBeNull();
  });

  it('rejects a cursor that is not a show id', () => {
    expect(() => catalogPageSchema.parse({ items: [], nextCursor: 'not-a-uuid' })).toThrow();
  });
});
