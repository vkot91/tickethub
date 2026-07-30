import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { payments, stripeEvents, type Db } from '@tickethub/db';
import { PAYMENT_ROUTING_KEYS, type EventKey, type EventPayload } from '@tickethub/contracts';
import { OutboxRepository } from '@tickethub/outbox';
import { StripeClient } from '../stripe.client';

type StripeObject = { id: string; amount?: number; metadata?: { orderId?: string } };
type PaymentStatus = (typeof payments.$inferInsert)['status'];

/** One event onto the outbox, bound to the caller's transaction. */
type Emit = <K extends EventKey>(routingKey: K, payload: EventPayload<K>) => Promise<void>;

/**
 * What one Stripe event type does: the payments row status it implies, and the domain event it
 * publishes.
 *
 * `publish` is a closure rather than a `{ routingKey, payload }` pair because a pair cannot say
 * that *this* payload belongs to *that* key — the two fields were independent, so a payload could
 * be filed under the wrong routing key and nothing would notice until a consumer read an undefined
 * field. Handing the effect an `Emit` puts both through one generic call, which relates them.
 */
type WebhookEffect = {
  status: PaymentStatus;
  publish: (emit: Emit, orderId: string, object: StripeObject) => Promise<void>;
};

// The only Stripe event types Payments reacts to. Anything else is acknowledged and ignored.
// Keyed by Stripe's own event type — genuinely an open set of strings, unlike our routing keys.
const WEBHOOK_EFFECTS: Record<string, WebhookEffect> = {
  'payment_intent.succeeded': {
    status: 'succeeded',
    publish: (emit, orderId, object) =>
      emit(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED, {
        orderId,
        paymentIntentId: object.id,
        amountCents: object.amount ?? 0,
      }),
  },
  'payment_intent.payment_failed': {
    status: 'failed',
    publish: (emit, orderId, object) =>
      emit(PAYMENT_ROUTING_KEYS.PAYMENT_FAILED, {
        orderId,
        paymentIntentId: object.id,
        reason: 'payment_failed',
      }),
  },
  'charge.refunded': {
    status: 'refunded',
    publish: (emit, orderId, object) =>
      emit(PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED, {
        orderId,
        paymentIntentId: object.id,
        amountCents: object.amount ?? 0,
      }),
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

      await effect.publish(
        (routingKey, payload) => this.outbox.enqueue(tx, { routingKey, payload }),
        orderId,
        object,
      );
    });
  }
}
