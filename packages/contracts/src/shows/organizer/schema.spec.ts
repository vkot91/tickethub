import { createShowSchema, updateShowSchema } from './schema';
import { ORGANIZER_SHOWS_MESSAGE_PATTERNS } from './wire';

describe('organizer shows wire names', () => {
  // `<audience>.<service>.<action>`, every one of them. A key missing the `organizer.` prefix is a
  // console call that landed on the buyer surface.
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.MY_SHOWS).toBe('organizer.shows.myShows');
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.PUT_PRICING).toBe('organizer.shows.putPricing');
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.CAPACITY).toBe('organizer.shows.capacity');
  });

  it('namespaces every action under organizer.shows', () => {
    for (const key of Object.values(ORGANIZER_SHOWS_MESSAGE_PATTERNS)) {
      expect(key.startsWith('organizer.shows.')).toBe(true);
    }
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
