import { PAYMENT_ROUTING_KEYS } from '../events';
import {
  createPaymentIntentSchema,
  paymentIntentResponseSchema,
  paymentSucceededSchema,
} from './index';

describe('payment contracts', () => {
  it('accepts a create-intent payload', () => {
    const dto = createPaymentIntentSchema.parse({
      orderId: '00000000-0000-0000-0000-000000000001',
    });
    expect(dto.orderId).toBeDefined();
  });

  it('validates the intent response shape', () => {
    const res = paymentIntentResponseSchema.parse({
      clientSecret: 'pi_123_secret_abc',
      paymentIntentId: 'pi_123',
      amountCents: 5000,
      currency: 'usd',
    });
    expect(res.amountCents).toBe(5000);
  });

  it('validates payment.succeeded event + routing key', () => {
    const ev = paymentSucceededSchema.parse({
      messageId: '00000000-0000-0000-0000-000000000002',
      orderId: '00000000-0000-0000-0000-000000000001',
      paymentIntentId: 'pi_123',
      amountCents: 5000,
    });
    expect(ev.paymentIntentId).toBe('pi_123');
    expect(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED).toBe('payment.succeeded');
  });
});
