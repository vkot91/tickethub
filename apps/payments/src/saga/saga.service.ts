import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { payments, type Db } from '@tickethub/db';
import type { OrderExpiredEvent, RefundRequestedEvent } from '@tickethub/contracts';
import { StripeClient } from '../stripe.client';

// Orders' events → Stripe. Neither handler claims a processed_messages row: both calls carry
// an idempotency key (the orderId), so Stripe itself collapses a redelivery. Claiming here
// would have to commit before the API call and would then swallow a retry of a failed one.
@Injectable()
export class PaymentsSagaService {
  constructor(
    @Inject('DB') private readonly db: Db,
    private readonly stripe: StripeClient,
  ) {}

  async refund(event: RefundRequestedEvent): Promise<void> {
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
