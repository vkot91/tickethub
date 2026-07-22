import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { payments, stripeEvents, type Db } from '@tickethub/db';
import {
  ORDERS_MESSAGE_PATTERNS,
  PAYMENT_ROUTING_KEYS,
  type CreatePaymentIntentDto,
  type OrderExpiredEvent,
  type PaymentIntentResponse,
  type RefundRequestedEvent,
} from '@tickethub/contracts';
import { OutboxRepository, InboxRepository } from '@tickethub/outbox';
import { StripeClient } from './stripe.client';

type OrderView = { id: string; status: string; totalCents: number; currency: string };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: Db,
    private readonly stripe: StripeClient,
    private readonly amqp: AmqpConnection,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
  ) {}

  async createIntent(userId: string, dto: CreatePaymentIntentDto): Promise<PaymentIntentResponse> {
    const order = await rpcRequest<OrderView>(this.amqp, ORDERS_MESSAGE_PATTERNS.GET, {
      userId,
      orderId: dto.orderId,
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'awaiting_payment')
      throw new ConflictException(`Order is ${order.status}, cannot pay`);

    const intent = await this.stripe.createPaymentIntent(
      order.id,
      order.totalCents,
      order.currency,
      {
        orderId: order.id,
        userId,
      },
    );

    await this.db
      .insert(payments)
      .values({
        orderId: order.id,
        stripePaymentIntentId: intent.id,
        amountCents: order.totalCents,
        currency: order.currency,
        status: 'requires_payment',
      })
      .onConflictDoUpdate({
        target: payments.orderId,
        set: { stripePaymentIntentId: intent.id, updatedAt: new Date() },
      })
      .returning();

    return {
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.id,
      amountCents: order.totalCents,
      currency: order.currency,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructEvent(rawBody, signature); // throws → 400 in controller

    await this.db.transaction(async (tx) => {
      const fresh = await tx
        .insert(stripeEvents)
        .values({ stripeEventId: event.id })
        .onConflictDoNothing()
        .returning();
      if (fresh.length === 0) return; // duplicate webhook

      const object = event.data.object as {
        id: string;
        amount?: number;
        metadata?: { orderId?: string };
      };
      const orderId = object.metadata?.orderId;
      if (!orderId) return; // not one of ours

      switch (event.type) {
        case 'payment_intent.succeeded':
          await tx
            .update(payments)
            .set({ status: 'succeeded', updatedAt: new Date() })
            .where(eq(payments.orderId, orderId));
          await this.outbox.enqueue(tx, {
            routingKey: PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED,
            payload: {
              messageId: uuid(),
              orderId,
              paymentIntentId: object.id,
              amountCents: object.amount ?? 0,
            },
          });
          break;
        case 'payment_intent.payment_failed':
          await tx
            .update(payments)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(payments.orderId, orderId));
          await this.outbox.enqueue(tx, {
            routingKey: PAYMENT_ROUTING_KEYS.PAYMENT_FAILED,
            payload: {
              messageId: uuid(),
              orderId,
              paymentIntentId: object.id,
              reason: 'payment_failed',
            },
          });
          break;
        case 'charge.refunded':
          await tx
            .update(payments)
            .set({ status: 'refunded', updatedAt: new Date() })
            .where(eq(payments.orderId, orderId));
          await this.outbox.enqueue(tx, {
            routingKey: PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED,
            payload: {
              messageId: uuid(),
              orderId,
              paymentIntentId: object.id,
              amountCents: object.amount ?? 0,
            },
          });
          break;
        default:
          return; // ignore other events
      }
    });
  }

  async refund(event: RefundRequestedEvent): Promise<void> {
    const seen = await this.db.transaction((tx) =>
      this.inbox.alreadyProcessed(tx, event.messageId),
    );
    if (seen) return;

    // REST-driven refunds omit paymentIntentId; resolve it from our own payments row.
    let paymentIntentId = event.paymentIntentId;
    if (!paymentIntentId) {
      const [row] = await this.db
        .select({ id: payments.stripePaymentIntentId })
        .from(payments)
        .where(eq(payments.orderId, event.orderId))
        .limit(1);
      if (!row) return; // no payment on record — nothing to refund
      paymentIntentId = row.id;
    }

    await this.stripe.createRefund(event.orderId, paymentIntentId);
  }

  // Orders → order.expired. The seat hold lapsed unpaid, so cancel the PaymentIntent instead of
  // leaving it payable — otherwise a late confirm charges the customer and the expire-then-pay
  // race has to refund it, costing Stripe fees for a seat nobody holds.
  async cancelExpired(event: OrderExpiredEvent): Promise<void> {
    const seen = await this.db.transaction((tx) =>
      this.inbox.alreadyProcessed(tx, event.messageId),
    );
    if (seen) return;

    const [row] = await this.db
      .select({ id: payments.stripePaymentIntentId, status: payments.status })
      .from(payments)
      .where(eq(payments.orderId, event.orderId))
      .limit(1);

    // No intent was ever created, or it already settled — nothing open to cancel.
    if (!row || row.status !== 'requires_payment') return;

    try {
      await this.stripe.cancelPaymentIntent(row.id);
    } catch (err) {
      // Stripe already moved it on (the customer paid just before expiry). markPaid's
      // refund.requested path owns that race — don't dead-letter over it.
      if ((err as { code?: string }).code === 'payment_intent_unexpected_state') return;
      throw err;
    }

    await this.db
      .update(payments)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(payments.orderId, event.orderId));
  }
}
