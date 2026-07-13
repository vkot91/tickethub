import { catalogQuerySchema, createEventSchema, eventDetailSchema } from './events';

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

describe('createEventSchema', () => {
  it('requires a non-empty title and datetime startsAt', () => {
    expect(() =>
      createEventSchema.parse({
        title: '',
        description: 'd',
        venueId: crypto.randomUUID(),
        startsAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow();
  });
});

describe('eventDetailSchema', () => {
  it('extends the summary with description and venueId', () => {
    const parsed = eventDetailSchema.parse({
      id: crypto.randomUUID(),
      title: 'Show',
      startsAt: '2026-01-01',
      posterUrl: null,
      status: 'published',
      description: 'A show',
      venueId: crypto.randomUUID(),
    });
    expect(parsed.description).toBe('A show');
  });
});
