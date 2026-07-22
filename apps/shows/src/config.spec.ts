import { schema } from './config';

const valid = { DATABASE_URL: 'postgres://x', RABBITMQ_URL: 'amqp://x' };

describe('shows config schema', () => {
  it('parses valid env, dropping extra keys', () => {
    expect(schema.parse({ ...valid, EXTRA: '1' })).toEqual(valid);
  });

  it('throws when a required var is missing', () => {
    expect(() => schema.parse({ DATABASE_URL: 'postgres://x' })).toThrow();
  });
});
