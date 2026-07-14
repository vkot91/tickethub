// configModuleFor validates env eagerly at import, so set placeholders before requiring the module.
it('module class is defined', () => {
  process.env.DATABASE_URL = 'postgres://localhost/test';
  process.env.RABBITMQ_URL = 'amqp://localhost';
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';

  const { PaymentsModule } = require('./payments.module') as typeof import('./payments.module');

  expect(PaymentsModule).toBeDefined();
});
