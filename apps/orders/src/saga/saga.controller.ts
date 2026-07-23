import { Controller } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  EVENTS_QUEUES,
  PAYMENT_ROUTING_KEYS,
  SHOW_ROUTING_KEYS,
  type PaymentFailedEvent,
  type PaymentSucceededEvent,
  type RefundSucceededEvent,
} from '@tickethub/contracts';
import { eventSub, nackOnError } from '@tickethub/rmq';
import { OrderSagaService } from './saga.service';

// Saga consumers on the events topic exchange. Each binds its own queue + DLX, so a failed
// handler dead-letters instead of requeueing forever.
@Controller()
export class OrderSagaController {
  constructor(private readonly sagaService: OrderSagaService) {}

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.PAYMENT_SUCCEEDED, EVENTS_QUEUES.ORDERS_PAYMENT_SUCCEEDED),
  )
  onPaymentSucceeded(event: PaymentSucceededEvent) {
    return nackOnError(() => this.sagaService.markPaid(event));
  }

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.PAYMENT_FAILED, EVENTS_QUEUES.ORDERS_PAYMENT_FAILED),
  )
  onPaymentFailed(event: PaymentFailedEvent) {
    return nackOnError(() => this.sagaService.markFailed(event));
  }

  @RabbitSubscribe(
    eventSub(PAYMENT_ROUTING_KEYS.REFUND_SUCCEEDED, EVENTS_QUEUES.ORDERS_REFUND_SUCCEEDED),
  )
  onRefundSucceeded(event: RefundSucceededEvent) {
    return nackOnError(() => this.sagaService.markRefunded(event));
  }

  @RabbitSubscribe(eventSub(SHOW_ROUTING_KEYS.SHOW_CANCELLED, EVENTS_QUEUES.ORDERS_SHOW_CANCELLED))
  onShowCancelled(event: { messageId: string; showId: string }) {
    return nackOnError(() => this.sagaService.refundAllPaidForShow(event));
  }
}
