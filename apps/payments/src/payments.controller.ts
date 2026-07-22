import { Controller } from '@nestjs/common';
import { RabbitRPC, RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import {
  EVENTS_EXCHANGE,
  EVENTS_QUEUES,
  ORDER_ROUTING_KEYS,
  PAYMENTS_MESSAGE_PATTERNS,
  RPC_EXCHANGE,
  type CreatePaymentIntentDto,
  type OrderExpiredEvent,
  type RefundRequestedEvent,
} from '@tickethub/contracts';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @RabbitRPC({ exchange: RPC_EXCHANGE, routingKey: PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT })
  createIntent(msg: { userId: string; dto: CreatePaymentIntentDto }) {
    return this.service.createIntent(msg.userId, msg.dto);
  }

  // Orders → refund.requested. Its own queue + DLX so a bad refund doesn't requeue forever.
  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: ORDER_ROUTING_KEYS.REFUND_REQUESTED,
    queue: EVENTS_QUEUES.PAYMENTS_REFUND_REQUESTED,
    queueOptions: { deadLetterExchange: `${EVENTS_QUEUES.PAYMENTS_REFUND_REQUESTED}.dlx` },
  })
  async onRefundRequested(event: RefundRequestedEvent) {
    try {
      await this.service.refund(event);
    } catch {
      return new Nack(false); // dead-letter instead of an infinite requeue
    }
  }

  // Orders → order.expired. Cancels the PaymentIntent so an unpaid, expired hold can't be
  // charged later. Own queue + DLX, same as the refund consumer.
  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: ORDER_ROUTING_KEYS.ORDER_EXPIRED,
    queue: EVENTS_QUEUES.PAYMENTS_ORDER_EXPIRED,
    queueOptions: { deadLetterExchange: `${EVENTS_QUEUES.PAYMENTS_ORDER_EXPIRED}.dlx` },
  })
  async onOrderExpired(event: OrderExpiredEvent) {
    try {
      await this.service.cancelExpired(event);
    } catch {
      return new Nack(false);
    }
  }
}
