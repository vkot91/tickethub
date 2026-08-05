import { schema } from './config';

// 32 chars, obviously not a real key.
const QR_SECRET = 'x'.repeat(32);

describe('config schema', () => {
  it('parses required env', () => {
    const config = schema.parse({
      DATABASE_URL: 'postgres://x',
      RABBITMQ_URL: 'amqp://x',
      REDIS_URL: 'redis://x',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 'b',
      S3_BUCKET_TICKETS: 'tickets',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 't@x',
      TICKET_QR_SECRET: QR_SECRET,
    });

    expect(config.SMTP_PORT).toBe(1025);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() => schema.parse({})).toThrow();
  });

  // It signs every QR token: an empty or short key makes forging a ticket trivial, and the app
  // must refuse to boot rather than issue guessable tickets.
  it.each([
    ['empty', ''],
    ['31 chars', 'x'.repeat(31)],
  ])('rejects a %s TICKET_QR_SECRET', (_label, secret) => {
    const env = {
      DATABASE_URL: 'postgres://x',
      RABBITMQ_URL: 'amqp://x',
      REDIS_URL: 'redis://x',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 'b',
      S3_BUCKET_TICKETS: 'tickets',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 't@x',
    };

    expect(() => schema.parse({ ...env, TICKET_QR_SECRET: secret })).toThrow();
    expect(() => schema.parse({ ...env, TICKET_QR_SECRET: QR_SECRET })).not.toThrow();
  });
});
