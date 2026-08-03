import { payments, paymentsOutbox, stripeEvents } from './payments';

describe('payments schema', () => {
  it('payments table exposes order + intent + status columns', () => {
    expect(Object.keys(payments)).toEqual(
      expect.arrayContaining([
        'id',
        'orderId',
        'stripePaymentIntentId',
        'amountCents',
        'currency',
        'status',
      ]),
    );
  });
  it('stripe_events is keyed by the stripe event id', () => {
    expect(Object.keys(stripeEvents)).toEqual(
      expect.arrayContaining(['stripeEventId', 'receivedAt']),
    );
  });
  it('reuses the outbox factory for the payments schema', () => {
    expect(Object.keys(paymentsOutbox)).toEqual(
      expect.arrayContaining(['routingKey', 'payload', 'publishedAt']),
    );
  });
});
