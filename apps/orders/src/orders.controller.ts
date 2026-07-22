import { Controller } from '@nestjs/common';
import { RabbitRPC, RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import {
  EVENTS_EXCHANGE,
  EVENTS_QUEUES,
  ORDERS_MESSAGE_PATTERNS,
  PAYMENT_ROUTING_KEYS,
  RPC_EXCHANGE,
  SHOW_ROUTING_KEYS,
  type CreateOrderDto,
  type PaymentFailedEvent,
  type PaymentSucceededEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { OrdersService } from './orders.service';

// Each event handler binds its own queue + DLX to the topic exchange, so a new subscriber
// (e.g. Notifications) can bind the same routing key without stealing Orders' messages.
const eventSub = (routingKey: string, queue: string) => ({
  exchange: EVENTS_EXCHANGE,
  routingKey,
  queue,
  queueOptions: { deadLetterExchange: `${queue}.dlx` },
});

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: ORDERS_MESSAGE_PATTERNS.CREATE })
  create(payload: { userId: string; idempotencyKey: string; dto: CreateOrderDto }) {
    return this.ordersService.create(payload.userId, payload.idempotencyKey, payload.dto);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: ORDERS_MESSAGE_PATTERNS.GET })
  get(payload: { userId: string; orderId: string }) {
    return this.ordersService.get(payload.userId, payload.orderId);
  }

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND })
  requestRefund(payload: { userId: string; orderId: string }) {
    return this.ordersService.requestRefund(payload.userId, payload.orderId);
  }

  // --- Saga consumers on the events topic exchange ---

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED, EVENTS_QUEUES.ORDERS_PAYMENT_SUCCEEDED),
  )
  async onPaymentSucceeded(e: PaymentSucceededEvent) {
    return this.guard(() => this.ordersService.markPaid(e));
  }

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.PAYMENT_FAILED, EVENTS_QUEUES.ORDERS_PAYMENT_FAILED),
  )
  async onPaymentFailed(e: PaymentFailedEvent) {
    return this.guard(() => this.ordersService.markFailed(e));
  }

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED, EVENTS_QUEUES.ORDERS_REFUND_SUCCEEDED),
  )
  async onRefundSucceeded(e: RefundSucceededEvent) {
    return this.guard(() => this.ordersService.markRefunded(e));
  }

  @RabbitSubscribe(eventSub(SHOW_ROUTING_KEYS.SHOW_CANCELLED, EVENTS_QUEUES.ORDERS_SHOW_CANCELLED))
  async onShowCancelled(e: { messageId: string; showId: string }) {
    return this.guard(() => this.ordersService.refundAllPaidForShow(e));
  }

  // A failed handler dead-letters (no requeue) rather than looping forever; consumers are
  // idempotent (processed_messages) so at-least-once redelivery on the happy path is safe.
  private async guard(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch {
      return new Nack(false);
    }
  }
}
