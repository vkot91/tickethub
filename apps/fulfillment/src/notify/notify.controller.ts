import { Controller, Inject, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import type { Queue } from 'bullmq';
import type { Db } from '@tickethub/db';
import { InboxRepository } from '@tickethub/outbox';
import {
  EVENTS_EXCHANGE,
  EVENTS_QUEUES,
  TICKET_ROUTING_KEYS,
  type TicketPdfReadyEvent,
} from '@tickethub/contracts';

@Controller()
export class NotifyController {
  private readonly log = new Logger(NotifyController.name);

  constructor(
    @Inject('DB') private readonly db: Db,
    @Inject('EMAIL_QUEUE') private readonly queue: Queue,
    private readonly inbox: InboxRepository,
  ) {}

  // Fulfillment → ticket.pdf_ready. Its own queue + DLX so a delivery that keeps failing
  // dead-letters instead of requeuing forever: the handler catches and returns `Nack(false)`,
  // because golevelup's default on an uncaught throw is an immediate requeue with no backoff —
  // which, with Redis down, would spin this handler and its Postgres transaction in a tight loop.
  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: TICKET_ROUTING_KEYS.TICKET_PDF_READY,
    queue: EVENTS_QUEUES.FULFILLMENT_TICKET_PDF_READY,
    queueOptions: { deadLetterExchange: `${EVENTS_QUEUES.FULFILLMENT_TICKET_PDF_READY}.dlx` },
  })
  async onPdfReady(event: TicketPdfReadyEvent) {
    // The claim and the enqueue live in the same transaction, deliberately unlike the read-only
    // pre-check + separate write elsewhere in this app: there is no domain row here for the claim
    // to commit alongside, only the enqueue itself. If `queue.add` throws, the transaction rolls
    // back and the claim is never persisted, so a redelivery genuinely retries. If `queue.add`
    // succeeds but the commit fails, the redelivery re-adds the same jobId, which BullMQ
    // deduplicates while the job still exists. That biases at-least-once email over at-most-once
    // — a duplicate email beats a silently missing ticket.
    try {
      await this.db.transaction(async (tx) => {
        const alreadyProcessed = await this.inbox.alreadyProcessed(tx, event.messageId);

        if (alreadyProcessed) return;

        await this.queue.add(
          'send-ticket-email',
          { orderId: event.orderId, userId: event.userId },
          { jobId: event.orderId },
        );
      });
    } catch (error) {
      this.log.error(
        { messageId: event.messageId, orderId: event.orderId, err: error },
        `ticket.pdf_ready enqueue failed for order ${event.orderId}, dead-lettering`,
      );

      return new Nack(false); // dead-letter instead of an infinite requeue
    }
  }
}
