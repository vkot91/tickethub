import {
  catalogPageSchema,
  catalogQuerySchema,
  createShowSchema,
  priceTierSchema,
  showDetailSchema,
  showPublishedSchema,
  updateShowSchema,
} from './schema';
import { SHOWS_MESSAGE_PATTERNS, SHOW_ROUTING_KEYS } from './wire';

describe('shows wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(SHOWS_MESSAGE_PATTERNS.CATALOG).toBe('shows.catalog');
    expect(SHOW_ROUTING_KEYS.SHOW_CANCELLED).toBe('show.cancelled');
  });
});

describe('showPublishedSchema', () => {
  it('rejects a show.published payload with a bad showId', () => {
    expect(() => showPublishedSchema.parse({ showId: 'x' })).toThrow();
  });
});

describe('updateShowSchema', () => {
  it('lets an update carry only the fields being changed', () => {
    expect(updateShowSchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
  });

  it('still rejects a bad value on a partial update', () => {
    expect(() => updateShowSchema.parse({ venueId: 'not-a-uuid' })).toThrow();
  });

  // Null clears the column; absent leaves it alone. Both have to survive the parse, or the
  // organizer can never take a poster back down.
  it('accepts null for the clearable fields', () => {
    expect(updateShowSchema.parse({ posterUrl: null, saleStartsAt: null })).toEqual({
      posterUrl: null,
      saleStartsAt: null,
    });
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

describe('createShowSchema', () => {
  it('requires a non-empty title and datetime startsAt', () => {
    expect(() =>
      createShowSchema.parse({
        title: '',
        description: 'd',
        venueId: crypto.randomUUID(),
        startsAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
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

  // The band is a fixed vocabulary shared with the seat map and the db enum; a free-form
  // string here would let a typo through and silently render an uncoloured dot.
  it('rejects a tier outside the three bands', () => {
    expect(() =>
      priceTierSchema.parse({
        id: crypto.randomUUID(),
        tier: 'platinum',
        name: 'Platinum',
        priceCents: 100,
        currency: 'usd',
      }),
    ).toThrow();
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
