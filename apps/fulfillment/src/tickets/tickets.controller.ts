import { Controller, Logger } from '@nestjs/common';
import { RabbitSubscribe, RabbitRPC, Nack } from '@golevelup/nestjs-rabbitmq';
import {
  EVENTS_QUEUES,
  ORDER_ROUTING_KEYS,
  TICKETS_MESSAGE_PATTERNS,
  type EventEnvelope,
} from '@tickethub/contracts';
import { eventSub, rpcSub } from '@tickethub/rmq';
import { TicketsService } from './tickets.service';

@Controller()
export class TicketsController {
  private readonly log = new Logger(TicketsController.name);

  constructor(private readonly ticketsService: TicketsService) {}

  // Orders → order.paid. Its own queue + DLX so a redelivery that keeps failing dead-letters
  // instead of requeuing forever.
  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.ORDER_PAID, EVENTS_QUEUES.FULFILLMENT_ORDER_PAID))
  async onOrderPaid(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID>) {
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

  @RabbitRPC(rpcSub(TICKETS_MESSAGE_PATTERNS.LIST))
  list(params: { userId: string }) {
    return this.ticketsService.listForUser(params.userId);
  }

  // Mints the presigned URL the gateway redirects to. Ownership is enforced in the service, at
  // this moment, not when the list was rendered.
  @RabbitRPC(rpcSub(TICKETS_MESSAGE_PATTERNS.PDF_URL))
  pdfUrl(params: { userId: string; ticketId: string }) {
    return this.ticketsService.pdfUrlFor(params.userId, params.ticketId);
  }
}
