import { PaymentsSagaService } from './saga.service';

describe('PaymentsSagaService.refund', () => {
  function deps(intentRow?: { id: string }) {
    const stripe = { createRefund: jest.fn().mockResolvedValue({ id: 're_1' }) };
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (intentRow ? [intentRow] : []) }) }),
      }),
    };

    return { service: new PaymentsSagaService(db as never, stripe as never), stripe };
  }

  it('refunds using the paymentIntentId carried on the event', async () => {
    const d = deps();

    await d.service.refund({ orderId: 'ord1', paymentIntentId: 'pi_1' });

    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_1');
  });

  it('resolves the intent from the payments row when the event omits it', async () => {
    const d = deps({ id: 'pi_looked_up' });

    await d.service.refund({ orderId: 'ord1' });

    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_looked_up');
  });

  it('is a no-op when the event omits the intent and no payments row exists', async () => {
    const d = deps(); // no intentRow

    await d.service.refund({ orderId: 'ord1' });

    expect(d.stripe.createRefund).not.toHaveBeenCalled();
  });

  // A redelivery must still reach Stripe: dedupe is Stripe's idempotency key (the orderId),
  // not a processed_messages row that would be committed before the API call and swallow
  // the retry of a refund that failed.
  it('retries reach Stripe under the same idempotency key', async () => {
    const d = deps();
    const event = { orderId: 'ord1', paymentIntentId: 'pi_1' };

    await d.service.refund(event);
    await d.service.refund(event);

    expect(d.stripe.createRefund).toHaveBeenCalledTimes(2);
    expect(d.stripe.createRefund).toHaveBeenNthCalledWith(2, 'ord1', 'pi_1');
  });
});

describe('PaymentsSagaService.cancelExpired', () => {
  function deps(
    row?: { id: string; status: string },
    cancel: () => Promise<void> = async () => undefined,
  ) {
    const updates: Array<Record<string, unknown>> = [];
    const stripe = { cancelPaymentIntent: jest.fn(cancel) };
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            updates.push(v);
          },
        }),
      }),
    };

    return { service: new PaymentsSagaService(db as never, stripe as never), stripe, updates };
  }

  const event = { orderId: 'ord1', showId: 'ev1' };

  it('cancels the open intent and marks the payment canceled', async () => {
    const d = deps({ id: 'pi_1', status: 'requires_payment' });

    await d.service.cancelExpired(event);

    expect(d.stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_1');
    expect(d.updates[0]).toMatchObject({ status: 'canceled' });
  });

  it('is a no-op when the order never had a payment', async () => {
    const d = deps(); // no row

    await d.service.cancelExpired(event);

    expect(d.stripe.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('never cancels an intent that already succeeded', async () => {
    const d = deps({ id: 'pi_1', status: 'succeeded' });

    await d.service.cancelExpired(event);

    expect(d.stripe.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(d.updates).toHaveLength(0);
  });

  // The expire-then-pay race: Stripe already moved the intent out of a cancelable state,
  // so markPaid's refund path owns it — this must not dead-letter.
  it('swallows Stripe payment_intent_unexpected_state and leaves the row alone', async () => {
    const d = deps({ id: 'pi_1', status: 'requires_payment' }, async () => {
      throw Object.assign(new Error('cannot cancel'), { code: 'payment_intent_unexpected_state' });
    });

    await expect(d.service.cancelExpired(event)).resolves.toBeUndefined();
    expect(d.updates).toHaveLength(0);
  });

  it('rethrows an unexpected Stripe failure so the message dead-letters', async () => {
    const d = deps({ id: 'pi_1', status: 'requires_payment' }, async () => {
      throw Object.assign(new Error('api down'), { code: 'api_error' });
    });

    await expect(d.service.cancelExpired(event)).rejects.toThrow('api down');
  });
});
