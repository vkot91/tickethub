import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
// Value import, not `import type`: AmqpConnection is this constructor's DI token.
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { payments, type Db } from '@tickethub/db';
import {
  ORDERS_MESSAGE_PATTERNS,
  type CreatePaymentIntentDto,
  type PaymentIntentResponse,
} from '@tickethub/contracts';
import { StripeClient } from '../stripe.client';

type OrderView = { id: string; status: string; totalCents: number; currency: string };

// The buyer-driven half of Payments: turn an order into a payable Stripe intent. What Stripe
// says back arrives on the webhook (WebhookService); what Orders asks for arrives on the
// events exchange (PaymentsSagaService).
@Injectable()
export class PaymentsService {
  constructor(
    @Inject('DB') private readonly db: Db,
    private readonly stripe: StripeClient,
    private readonly amqp: AmqpConnection,
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
      { orderId: order.id, userId },
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
}
