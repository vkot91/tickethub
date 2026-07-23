import { PAYMENT_ROUTING_KEYS } from '@tickethub/contracts';
import { WebhookService } from './webhook.service';

function deps(
  duplicate = false,
  type = 'payment_intent.succeeded',
  metadata = { orderId: 'ord1' },
) {
  const enqueued: Array<{ routingKey: string; payload: Record<string, unknown> }> = [];
  const outbox = {
    enqueue: jest.fn(
      async (_tx: unknown, msg: { routingKey: string; payload: Record<string, unknown> }) => {
        enqueued.push(msg);
      },
    ),
  };
  const stripe = {
    constructEvent: jest.fn().mockReturnValue({
      id: 'evt_1',
      type,
      data: { object: { id: 'pi_1', amount: 5000, metadata } },
    }),
  };
  const statuses: string[] = [];
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: async () => (duplicate ? [] : [{ stripeEventId: 'evt_1' }]),
            }),
          }),
        }),
        update: () => ({
          set: (v: { status: string }) => {
            statuses.push(v.status);
            return { where: async () => undefined };
          },
        }),
      }),
  };

  const service = new WebhookService(db as never, stripe as never, outbox as never);

  return { service, stripe, db, outbox, enqueued, statuses };
}

describe('WebhookService.handleWebhook', () => {
  it('emits payment.succeeded and marks the payment succeeded', async () => {
    const d = deps();

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED);
    expect(d.enqueued[0].payload).toMatchObject({
      orderId: 'ord1',
      paymentIntentId: 'pi_1',
      amountCents: 5000,
    });
    expect(d.statuses).toEqual(['succeeded']);
  });

  it('is a no-op on a duplicate stripe event', async () => {
    const d = deps(true);

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued).toHaveLength(0);
    expect(d.statuses).toHaveLength(0);
  });

  it('emits payment.failed with a reason on a failed intent', async () => {
    const d = deps(false, 'payment_intent.payment_failed');

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.PAYMENT_FAILED);
    expect(d.enqueued[0].payload).toMatchObject({ reason: 'payment_failed' });
    expect(d.statuses).toEqual(['failed']);
  });

  it('emits refund.succeeded on a charge.refunded', async () => {
    const d = deps(false, 'charge.refunded');

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED);
    expect(d.statuses).toEqual(['refunded']);
  });

  it('ignores unrelated event types (no update, no outbox)', async () => {
    const d = deps(false, 'payment_intent.created');

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued).toHaveLength(0);
    expect(d.statuses).toHaveLength(0);
  });

  it('ignores an event that carries no orderId (not one of ours)', async () => {
    const d = deps(false, 'payment_intent.succeeded', {} as { orderId: string });

    await d.service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(d.enqueued).toHaveLength(0);
  });
});
