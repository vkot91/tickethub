import { Controller, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import {
  EVENTS_EXCHANGE,
  EVENTS_QUEUES,
  ORDER_ROUTING_KEYS,
  type OrderPaidEvent,
} from '@tickethub/contracts';
import { TicketsService } from './tickets.service';

@Controller()
export class TicketsController {
  private readonly log = new Logger(TicketsController.name);

  constructor(private readonly ticketsService: TicketsService) {}

  // Orders → order.paid. Its own queue + DLX so a redelivery that keeps failing dead-letters
  // instead of requeuing forever.
  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: ORDER_ROUTING_KEYS.ORDER_PAID,
    queue: EVENTS_QUEUES.FULFILLMENT_ORDER_PAID,
    queueOptions: { deadLetterExchange: `${EVENTS_QUEUES.FULFILLMENT_ORDER_PAID}.dlx` },
  })
  async onOrderPaid(event: OrderPaidEvent) {
    try {
      await this.ticketsService.handleOrderPaid(event);
    } catch (error) {
      // This app has no HTTP surface, so nestjs-pino's auto-logging never fires: without this
      // line a dead-lettered ticket leaves no trace at all.
      this.log.error(
        { messageId: event.messageId, orderId: event.orderId, err: error },
        `order.paid fulfilment failed for order ${event.orderId}, dead-lettering`,
      );

      return new Nack(false); // dead-letter instead of an infinite requeue
    }
  }
}
