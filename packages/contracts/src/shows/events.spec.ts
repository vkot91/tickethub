import { SHOW_ROUTING_KEYS, showPublishedSchema } from './events';

describe('shows events', () => {
  it('mirrors each key onto its wire value', () => {
    expect(SHOW_ROUTING_KEYS.SHOW_PUBLISHED).toBe('show.published');
    expect(SHOW_ROUTING_KEYS.SHOW_CANCELLED).toBe('show.cancelled');
  });

  it('rejects a show.published payload with a bad showId', () => {
    expect(() => showPublishedSchema.parse({ showId: 'x' })).toThrow();
  });
});
