import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { tickets, fulfillmentProcessedMessages, type Db } from '@tickethub/db';
import { OutboxRepository, InboxRepository } from '@tickethub/outbox';
import {
  ORDERS_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  TICKET_ROUTING_KEYS,
  type OrderPaidEvent,
  type OrderResponse,
  type SeatMap,
  type ShowDetail,
} from '@tickethub/contracts';
import { signTicketToken, renderQrPng } from '../pdf/qr';
import { renderTicketPdf } from '../pdf/pdf';
import { S3Client } from '../storage/s3.client';

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: Db,
    private readonly s3: S3Client,
    private readonly amqp: AmqpConnection,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
    private readonly qrSecret: string,
  ) {}

  async handleOrderPaid(event: OrderPaidEvent): Promise<void> {
    // Read-only pre-check — an optimisation only, never the authoritative claim. It skips the
    // expensive render for a redelivery of a message that already committed; the real claim
    // happens inside the write transaction below, so a failure mid-flight leaves nothing claimed.
    const [alreadyCommitted] = await this.db
      .select({ messageId: fulfillmentProcessedMessages.messageId })
      .from(fulfillmentProcessedMessages)
      .where(eq(fulfillmentProcessedMessages.messageId, event.messageId))
      .limit(1);

    if (alreadyCommitted) return;

    const order = await rpcRequest<OrderResponse>(this.amqp, ORDERS_MESSAGE_PATTERNS.GET, {
      userId: event.userId,
      orderId: event.orderId,
    });

    const show = await rpcRequest<ShowDetail>(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, {
      id: event.showId,
    });

    const seatMap = await rpcRequest<SeatMap>(this.amqp, SHOWS_MESSAGE_PATTERNS.SEAT_MAP, {
      id: event.showId,
    });

    const labelBySeatId = new Map(
      seatMap.sections.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.seats.map(
            (seat) => [seat.id, `${section.name} ${row.number}-${seat.number}`] as const,
          ),
        ),
      ),
    );

    const seatLabels = order.seats.map((seat) => labelBySeatId.get(seat.seatId) ?? seat.seatId);

    // One ticket per order (`tickets_order_uq`), so the order id IS the ticket id — no derivation.
    // Being stable per order is what matters: a redelivery re-signs the same QR token and re-puts
    // the PDF under the same fixed S3 key, so an overwrite can never desync the object from the row.
    const ticketId = event.orderId;
    const qrToken = signTicketToken(ticketId, this.qrSecret);

    const pdf = await renderTicketPdf({
      showTitle: show.title,
      startsAt: show.startsAt,
      orderId: event.orderId,
      seatLabels,
      qrPng: await renderQrPng(qrToken),
    });

    // Fixed key: a redelivery overwrites the same object instead of littering the bucket.
    const s3Key = `${event.orderId}.pdf`;
    await this.s3.put(s3Key, pdf, 'application/pdf');

    await this.db.transaction(async (tx) => {
      // Authoritative claim: it commits atomically with the ticket row and the outbox row, so a
      // redelivery after any earlier failure genuinely retries (one wasted render, at worst).
      const seen = await this.inbox.alreadyProcessed(tx, event.messageId);

      if (seen) return;

      const inserted = await tx
        .insert(tickets)
        .values({ id: ticketId, orderId: event.orderId, s3Key, qrToken })
        .onConflictDoNothing()
        .returning();

      // A different messageId for an order that already has a ticket: no row, so no second
      // ticket.pdf_ready and no duplicate email.
      if (inserted.length === 0) return;

      await this.outbox.enqueue(tx, {
        routingKey: TICKET_ROUTING_KEYS.TICKET_PDF_READY,
        payload: { messageId: randomUUID(), orderId: event.orderId, userId: event.userId },
      });
    });
  }
}
