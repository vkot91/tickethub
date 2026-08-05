import { Controller, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_QUEUES, ORDER_ROUTING_KEYS, type EventEnvelope } from '@tickethub/contracts';
import { eventSub } from '@tickethub/rmq';
import { TicketsService } from './tickets.service';

/**
 * Minting, driven by Orders. Not in `user/` and not in `organizer/`: an event has no audience by
 * construction — the publisher is another service and nobody is logged in — so it cannot live in
 * a folder whose whole job is to name the caller.
 */
@Controller()
export class TicketIssueController {
  private readonly log = new Logger(TicketIssueController.name);

  constructor(private readonly ticketsService: TicketsService) {}

  // Orders → order.paid. Its own queue + DLX so a redelivery that keeps failing dead-letters
  // instead of requeuing forever.
  @RabbitSubscribe(eventSub(ORDER_ROUTING_KEYS.ORDER_PAID, EVENTS_QUEUES.TICKETS_ORDER_PAID))
  async onOrderPaid(event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID>) {
    try {
      await this.ticketsService.issue(event);
    } catch (error) {
      // This app has no HTTP surface, so nestjs-pino's auto-logging never fires: without this
      // line a dead-lettered ticket leaves no trace at all.
      this.log.error(
        { messageId: event.messageId, orderId: event.orderId, err: error },
        `order.paid ticket issue failed for order ${event.orderId}, dead-lettering`,
      );

      return new Nack(false);
    }
  }
}
