import { schema } from './config';

const valid = {
  DATABASE_URL: 'postgres://x',
  RABBITMQ_URL: 'amqp://x',
  REDIS_URL: 'redis://x',
};

describe('orders config schema', () => {
  it('parses valid env with the default reservation TTL', () => {
    expect(schema.parse({ ...valid, EXTRA: '1' })).toEqual({ ...valid, RESERVATION_TTL_SEC: 600 });
  });

  it('coerces RESERVATION_TTL_SEC from a string', () => {
    expect(schema.parse({ ...valid, RESERVATION_TTL_SEC: '5' }).RESERVATION_TTL_SEC).toBe(5);
  });

  it('throws when a required var is missing', () => {
    expect(() => schema.parse({ DATABASE_URL: 'postgres://x' })).toThrow();
  });
});
