import {
  becomeOrganizerSchema,
  createShowSchema,
  showPricingSchema,
  updateShowSchema,
} from './schema';
import { ORGANIZER_PROFILE_MESSAGE_PATTERNS, ORGANIZER_SHOWS_MESSAGE_PATTERNS } from './wire';

describe('organizer shows wire names', () => {
  // `<audience>.<service>.<action>`, every one of them. A key missing the `organizer.` prefix is a
  // console call that landed on the buyer surface.
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.LIST).toBe('organizer.shows.list');
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.UPDATE_PRICING).toBe('organizer.shows.updatePricing');
    expect(ORGANIZER_SHOWS_MESSAGE_PATTERNS.SUMMARIES).toBe('organizer.shows.summaries');
  });

  it('namespaces every action under organizer.shows', () => {
    for (const key of Object.values(ORGANIZER_SHOWS_MESSAGE_PATTERNS)) {
      expect(key.startsWith('organizer.shows.')).toBe(true);
    }
  });
});

describe('organizer profile wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_PROFILE_MESSAGE_PATTERNS.CREATE).toBe('organizer.profile.create');
  });

  it('requires a non-empty organizer name', () => {
    expect(becomeOrganizerSchema.parse({ name: 'Acme' })).toEqual({ name: 'Acme' });
    expect(() => becomeOrganizerSchema.parse({ name: '' })).toThrow();
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

describe('showPricingSchema', () => {
  // The read side addresses bands by id. A client that sent the write side's `key` back would
  // parse-fail here rather than silently assigning a section to nothing.
  it('rejects an assignment carrying a client key instead of a band id', () => {
    expect(() =>
      showPricingSchema.parse({
        priceBands: [],
        assignments: [{ sectionId: crypto.randomUUID(), bandId: 'front-vip' }],
      }),
    ).toThrow();
  });

  it('accepts a show with nothing priced', () => {
    expect(showPricingSchema.parse({ priceBands: [], assignments: [] })).toEqual({
      priceBands: [],
      assignments: [],
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
