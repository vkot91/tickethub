import { loadEnv, requireEnv } from '@tickethub/env';
import { sql, eq } from 'drizzle-orm';
import { createDb, payments, paymentsOutbox, stripeEvents, type Db } from '@tickethub/db';
import { OutboxRepository } from '@tickethub/outbox';
import { PAYMENT_ROUTING_KEYS } from '@tickethub/contracts';
import { WebhookService } from './webhook.service';

jest.setTimeout(30_000);

// A fake Stripe that always returns the same payment_intent.succeeded event — proves the
// stripe_events dedupe path end-to-end against a real Postgres, with no network to Stripe.
function fakeStripe(orderId: string) {
  return {
    constructEvent: () => ({
      id: 'evt_dedupe_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', amount: 5000, metadata: { orderId } } },
    }),
  };
}

describe('Payments webhook idempotency (integration: real Postgres)', () => {
  let db: Db;
  let svc: WebhookService;
  const orderId = '00000000-0000-0000-0000-0000000000aa';

  beforeAll(() => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    svc = new WebhookService(
      db,
      fakeStripe(orderId) as never,
      new OutboxRepository(db, paymentsOutbox),
    );
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate ${payments}, ${stripeEvents}, ${sql.raw('"payments"."outbox"')}, ${sql.raw('"payments"."processed_messages"')} restart identity cascade`,
    );
    await db.insert(payments).values({
      orderId,
      stripePaymentIntentId: 'pi_1',
      amountCents: 5000,
      currency: 'usd',
      status: 'requires_payment',
    });
  });

  it('processes a stripe event exactly once across duplicate deliveries', async () => {
    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    await svc.handleWebhook(Buffer.from('{}'), 'sig'); // duplicate delivery

    const events = await db.select().from(stripeEvents);
    const outbox = await db.select().from(paymentsOutbox);
    const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));

    expect(events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].routingKey).toBe(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED);
    expect(row.status).toBe('succeeded');
  });
});
