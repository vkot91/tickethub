import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { payments, stripeEvents, type Db } from '@tickethub/db';
import { PAYMENT_ROUTING_KEYS } from '@tickethub/contracts';
import { OutboxRepository } from '@tickethub/outbox';
import { StripeClient } from '../stripe.client';

type StripeObject = { id: string; amount?: number; metadata?: { orderId?: string } };
type PaymentStatus = (typeof payments.$inferInsert)['status'];

type WebhookEffect = {
  status: PaymentStatus;
  routingKey: string;
  payload: (object: StripeObject) => Record<string, unknown>;
};

// The only Stripe event types Payments reacts to. Anything else is acknowledged and ignored.
const WEBHOOK_EFFECTS: Record<string, WebhookEffect> = {
  'payment_intent.succeeded': {
    status: 'succeeded',
    routingKey: PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED,
    payload: (object) => ({ paymentIntentId: object.id, amountCents: object.amount ?? 0 }),
  },
  'payment_intent.payment_failed': {
    status: 'failed',
    routingKey: PAYMENT_ROUTING_KEYS.PAYMENT_FAILED,
    payload: (object) => ({ paymentIntentId: object.id, reason: 'payment_failed' }),
  },
  'charge.refunded': {
    status: 'refunded',
    routingKey: PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED,
    payload: (object) => ({ paymentIntentId: object.id, amountCents: object.amount ?? 0 }),
  },
};

// Stripe's side of the saga: verify the webhook, dedupe it on stripe_events, and turn it into
// one payments row update + one outbox row, in a single transaction.
@Injectable()
export class WebhookService {
  constructor(
    @Inject('DB') private readonly db: Db,
    private readonly stripe: StripeClient,
    private readonly outbox: OutboxRepository,
  ) {}

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructEvent(rawBody, signature); // throws → 400 in controller

    await this.db.transaction(async (tx) => {
      const fresh = await tx
        .insert(stripeEvents)
        .values({ stripeEventId: event.id })
        .onConflictDoNothing()
        .returning();
      if (fresh.length === 0) return; // duplicate webhook

      const object = event.data.object as StripeObject;
      const orderId = object.metadata?.orderId;
      if (!orderId) return; // not one of ours

      const effect = WEBHOOK_EFFECTS[event.type];
      if (!effect) return;

      await tx
        .update(payments)
        .set({ status: effect.status, updatedAt: new Date() })
        .where(eq(payments.orderId, orderId));

      await this.outbox.enqueue(tx, {
        routingKey: effect.routingKey,
        payload: { messageId: uuid(), orderId, ...effect.payload(object) },
      });
    });
  }
}
