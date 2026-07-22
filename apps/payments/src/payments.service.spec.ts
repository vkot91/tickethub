import { ConflictException, NotFoundException } from '@nestjs/common';
import { PAYMENT_ROUTING_KEYS } from '@tickethub/contracts';
import { PaymentsService } from './payments.service';

function deps(
  order: unknown = { id: 'ord1', status: 'awaiting_payment', totalCents: 5000, currency: 'usd' },
) {
  const stripe = {
    createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'pi_1_secret' }),
  };
  const rows: unknown[] = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            rows.push(v);
            return [v];
          },
        }),
      }),
    }),
  };
  // PaymentsService now calls orders.get via rpcRequest(amqp, ...), which resolves a Promise.
  const amqp = { request: jest.fn().mockResolvedValue(order) };
  return { stripe, db, amqp, rows };
}

describe('PaymentsService.createIntent', () => {
  const dto = { orderId: 'ord1' };

  it('creates an intent and returns the client secret', async () => {
    const d = deps();
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      d.amqp as never,
      {} as never,
      {} as never,
    );
    const res = await svc.createIntent('u1', dto);
    expect(res.clientSecret).toBe('pi_1_secret');
    expect(d.stripe.createPaymentIntent).toHaveBeenCalledWith(
      'ord1',
      5000,
      'usd',
      expect.objectContaining({ orderId: 'ord1' }),
    );
  });

  it('rejects an order that is not awaiting_payment', async () => {
    const d = deps({ id: 'ord1', status: 'paid', totalCents: 5000, currency: 'usd' });
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      d.amqp as never,
      {} as never,
      {} as never,
    );
    await expect(svc.createIntent('u1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound when the order RPC returns nothing', async () => {
    const d = deps(null);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      d.amqp as never,
      {} as never,
      {} as never,
    );
    await expect(svc.createIntent('u1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });
});

function webhookDeps(existingShow = false, type = 'payment_intent.succeeded') {
  const enqueued: Array<{ routingKey: string }> = [];
  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, msg: { routingKey: string }) => {
      enqueued.push(msg);
    }),
  };
  const stripe = {
    constructEvent: jest.fn().mockReturnValue({
      id: 'evt_1',
      type,
      data: { object: { id: 'pi_1', amount: 5000, metadata: { orderId: 'ord1' } } },
    }),
  };
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: async () => (existingShow ? [] : [{ stripeEventId: 'evt_1' }]),
            }),
          }),
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      }),
  };
  const inbox = { alreadyProcessed: jest.fn().mockResolvedValue(false) };
  return { stripe, db, outbox, inbox, enqueued };
}

describe('PaymentsService.handleWebhook', () => {
  it('emits payment.succeeded on a fresh event', async () => {
    const d = webhookDeps(false);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
      d.inbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED);
  });

  it('is a no-op on a duplicate stripe event', async () => {
    const d = webhookDeps(true);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
      d.inbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued).toHaveLength(0);
  });

  it('emits payment.failed on a failed intent', async () => {
    const d = webhookDeps(false, 'payment_intent.payment_failed');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
      d.inbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.PAYMENT_FAILED);
  });

  it('emits refund.succeeded on a charge.refunded', async () => {
    const d = webhookDeps(false, 'charge.refunded');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
      d.inbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED);
  });

  it('ignores unrelated event types (no outbox)', async () => {
    const d = webhookDeps(false, 'payment_intent.created');
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      d.outbox as never,
      d.inbox as never,
    );
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    expect(d.enqueued).toHaveLength(0);
  });
});

describe('PaymentsService.refund', () => {
  function refundDeps(seen: boolean, intentRow?: { id: string }) {
    const stripe = { createRefund: jest.fn().mockResolvedValue({ id: 're_1' }) };
    const db = {
      transaction: async (fn: (tx: unknown) => unknown) => fn({}),
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (intentRow ? [intentRow] : []) }) }),
      }),
    };
    const inbox = { alreadyProcessed: jest.fn().mockResolvedValue(seen) };
    return { stripe, db, inbox };
  }

  it('refunds using the paymentIntentId carried on the event', async () => {
    const d = refundDeps(false);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      {} as never,
      d.inbox as never,
    );
    await svc.refund({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' });
    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_1');
  });

  it('resolves the intent from the payments row when the event omits it', async () => {
    const d = refundDeps(false, { id: 'pi_looked_up' });
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      {} as never,
      d.inbox as never,
    );
    await svc.refund({ messageId: 'm1', orderId: 'ord1' });
    expect(d.stripe.createRefund).toHaveBeenCalledWith('ord1', 'pi_looked_up');
  });

  it('is a no-op when the message was already processed', async () => {
    const d = refundDeps(true);
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      {} as never,
      d.inbox as never,
    );
    await svc.refund({ messageId: 'm1', orderId: 'ord1', paymentIntentId: 'pi_1' });
    expect(d.stripe.createRefund).not.toHaveBeenCalled();
  });

  it('is a no-op when the event omits the intent and no payments row exists', async () => {
    const d = refundDeps(false); // no intentRow
    const svc = new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      {} as never,
      d.inbox as never,
    );
    await svc.refund({ messageId: 'm1', orderId: 'ord1' });
    expect(d.stripe.createRefund).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.cancelExpired', () => {
  function cancelDeps(
    seen: boolean,
    row?: { id: string; status: string },
    cancel: () => Promise<void> = async () => undefined,
  ) {
    const updates: Array<Record<string, unknown>> = [];
    const stripe = { cancelPaymentIntent: jest.fn(cancel) };
    const db = {
      transaction: async (fn: (tx: unknown) => unknown) => fn({}),
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
    const inbox = { alreadyProcessed: jest.fn().mockResolvedValue(seen) };
    return { stripe, db, updates, inbox };
  }

  const event = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' };

  const build = (d: ReturnType<typeof cancelDeps>) =>
    new PaymentsService(
      d.db as never,
      d.stripe as never,
      {} as never,
      {} as never,
      d.inbox as never,
    );

  it('cancels the open intent and marks the payment canceled', async () => {
    const d = cancelDeps(false, { id: 'pi_1', status: 'requires_payment' });
    await build(d).cancelExpired(event);
    expect(d.stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_1');
    expect(d.updates[0]).toMatchObject({ status: 'canceled' });
  });

  it('is a no-op when the message was already processed', async () => {
    const d = cancelDeps(true, { id: 'pi_1', status: 'requires_payment' });
    await build(d).cancelExpired(event);
    expect(d.stripe.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('is a no-op when the order never had a payment', async () => {
    const d = cancelDeps(false); // no row
    await build(d).cancelExpired(event);
    expect(d.stripe.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('never cancels an intent that already succeeded', async () => {
    const d = cancelDeps(false, { id: 'pi_1', status: 'succeeded' });
    await build(d).cancelExpired(event);
    expect(d.stripe.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(d.updates).toHaveLength(0);
  });

  // The expire-then-pay race: Stripe already moved the intent out of a cancelable state,
  // so markPaid's refund path owns it — this must not dead-letter.
  it('swallows Stripe payment_intent_unexpected_state and leaves the row alone', async () => {
    const d = cancelDeps(false, { id: 'pi_1', status: 'requires_payment' }, async () => {
      throw Object.assign(new Error('cannot cancel'), { code: 'payment_intent_unexpected_state' });
    });
    await expect(build(d).cancelExpired(event)).resolves.toBeUndefined();
    expect(d.updates).toHaveLength(0);
  });

  it('rethrows an unexpected Stripe failure so the message dead-letters', async () => {
    const d = cancelDeps(false, { id: 'pi_1', status: 'requires_payment' }, async () => {
      throw Object.assign(new Error('api down'), { code: 'api_error' });
    });
    await expect(build(d).cancelExpired(event)).rejects.toThrow('api down');
  });
});
