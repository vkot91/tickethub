import { schema } from './config';

const valid = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  RABBITMQ_URL: 'amqp://x',
  JWT_ACCESS_SECRET: 'a',
  JWT_REFRESH_SECRET: 'r',
};

describe('auth config schema', () => {
  it('parses valid env, dropping extra keys', () => {
    expect(schema.parse({ ...valid, EXTRA: '1' })).toEqual(valid);
  });

  it('throws when a required var is missing', () => {
    expect(() => schema.parse({ ...valid, RABBITMQ_URL: undefined })).toThrow();
  });
});
