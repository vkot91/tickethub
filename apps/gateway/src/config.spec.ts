import { schema } from './config';

describe('gateway config schema', () => {
  it('coerces PORT to a number and defaults it', () => {
    expect(schema.parse({ RABBITMQ_URL: 'amqp://x', REDIS_URL: 'redis://x' }).PORT).toBe(3000);
    expect(
      schema.parse({ RABBITMQ_URL: 'amqp://x', REDIS_URL: 'redis://x', PORT: '8080' }).PORT,
    ).toBe(8080);
  });

  it('throws when a required var is missing', () => {
    expect(() => schema.parse({ RABBITMQ_URL: 'amqp://x' })).toThrow();
  });
});
