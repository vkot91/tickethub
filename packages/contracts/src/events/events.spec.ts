import { MESSAGE_PATTERNS, QUEUES, userRegisteredSchema, eventPublishedSchema } from './index';

describe('contract constants', () => {
  it('exposes the RPC patterns and queue names', () => {
    expect(MESSAGE_PATTERNS.auth.login).toBe('auth.login');
    expect(QUEUES.authRpc).toBe('auth.rpc');
  });
});

describe('event schemas', () => {
  it('validates a userRegistered event', () => {
    const evt = { messageId: crypto.randomUUID(), userId: crypto.randomUUID(), email: 'a@b.com' };
    expect(userRegisteredSchema.parse(evt)).toEqual(evt);
  });

  it('rejects an eventPublished event with a bad eventId', () => {
    expect(() =>
      eventPublishedSchema.parse({ messageId: crypto.randomUUID(), eventId: 'x' }),
    ).toThrow();
  });
});
