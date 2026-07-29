import { schema } from './config';

const valid = {
  DATABASE_URL: 'postgres://x',
  RABBITMQ_URL: 'amqp://x',
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET_POSTERS: 'posters',
};

describe('shows config schema', () => {
  it('parses valid env, dropping extra keys', () => {
    expect(schema.parse({ ...valid, EXTRA: '1' })).toEqual(valid);
  });

  it('throws when a required var is missing', () => {
    expect(() => schema.parse({ DATABASE_URL: 'postgres://x' })).toThrow();
  });
});
