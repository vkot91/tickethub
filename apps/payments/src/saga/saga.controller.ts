import { Controller } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_QUEUES, ORDER_ROUTING_KEYS, type EventEnvelope } from '@tickethub/contracts';
import { eventSub, nackOnError } from '@tickethub/rmq';
import { PaymentsSagaService } from './saga.service';

// Orders' events, each on its own queue + DLX so a bad message dead-letters instead of
// requeueing forever.
@Controller()
export class PaymentsSagaController {
  constructor(private readonly sagaService: PaymentsSagaService) {}

  @RabbitSubscribe(
    eventSub(ORDER_ROUTING_KEYS.REFUND_REQUESTED, EVENTS_QUEUES.PAYMENTS_REFUND_REQUESTED),
  )
  onRefundRequested(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.REFUND_REQUESTED>) {
    return nackOnError(() => this.sagaService.refund(event));
  }

  // The seat hold lapsed unpaid: cancel the intent so it can't be charged later.
  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.ORDER_EXPIRED, EVENTS_QUEUES.PAYMENTS_ORDER_EXPIRED))
  onOrderExpired(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_EXPIRED>) {
    return nackOnError(() => this.sagaService.cancelExpired(event));
  }
}
