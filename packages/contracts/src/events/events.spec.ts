import { AUTH_MESSAGE_PATTERNS, SHOWS_MESSAGE_PATTERNS, SHOW_ROUTING_KEYS } from './index';
import { userRegisteredSchema } from '../dto/auth';
import { showPublishedSchema } from '../dto/shows';

describe('contract constants', () => {
  it('exposes the RPC patterns and queue names', () => {
    expect(AUTH_MESSAGE_PATTERNS.LOGIN).toBe('auth.login');
    expect(SHOWS_MESSAGE_PATTERNS.CATALOG).toBe('shows.catalog');
    expect(SHOW_ROUTING_KEYS.SHOW_CANCELLED).toBe('show.cancelled');
  });
});

describe('event schemas', () => {
  it('validates a userRegistered event', () => {
    const evt = { messageId: crypto.randomUUID(), userId: crypto.randomUUID(), email: 'a@b.com' };
    expect(userRegisteredSchema.parse(evt)).toEqual(evt);
  });

  it('rejects a show.published event with a bad showId', () => {
    expect(() =>
      showPublishedSchema.parse({ messageId: crypto.randomUUID(), showId: 'x' }),
    ).toThrow();
  });
});
