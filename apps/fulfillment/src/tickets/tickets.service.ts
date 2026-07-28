import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { rpcRequest } from '@tickethub/rmq';
import { StorageClient } from '@tickethub/storage';
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
  type Ticket,
  type TicketList,
  type TicketPdfUrl,
} from '@tickethub/contracts';
import { signTicketToken, renderQrPng, deriveTicketId } from './qr';
import { renderTicketPdf } from './ticket-pdf';

/** Long enough to follow one redirect, short enough that a leaked URL is worthless. */
const PDF_URL_TTL_SECONDS = 60;

/** Display only. Never parsed, never used for lookup — the QR token is the only credential. */
const displayCode = (ticketId: string) =>
  `TH-${ticketId.slice(0, 4)}-${ticketId.slice(4, 8)}`.toUpperCase();

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageClient,
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

    // The organizer's own wording for the price band ("Loge", "Early Bird"), not the three-way
    // colour band — that is what belongs on a ticket.
    const tierNameByTicketTypeId = new Map(
      show.priceTiers.map((priceTier) => [priceTier.id, priceTier.name] as const),
    );

    // One row per seat: a ticket is what a gate admits, so a three-seat order is three tickets.
    // Ids are derived, so every redelivery re-signs identical tokens (see deriveTicketId).
    const seatTickets = order.seats.map((seat) => {
      const id = deriveTicketId(event.orderId, seat.seatId);

      return {
        id,
        seatId: seat.seatId,
        seatLabel: labelBySeatId.get(seat.seatId) ?? seat.seatId,
        tier: tierNameByTicketTypeId.get(seat.ticketTypeId) ?? 'Standard',
        qrToken: signTicketToken(id, this.qrSecret),
      };
    });

    const pdf = await renderTicketPdf({
      showTitle: show.title,
      startsAt: show.startsAt,
      orderId: event.orderId,
      seats: await Promise.all(
        seatTickets.map(async (seatTicket) => ({
          seatLabel: seatTicket.seatLabel,
          tier: seatTicket.tier,
          qrPng: await renderQrPng(seatTicket.qrToken),
        })),
      ),
    });

    // Fixed key, one document per order (a page per seat): a redelivery overwrites the same
    // object with identical bytes instead of littering the bucket.
    const s3Key = `${event.orderId}.pdf`;
    await this.storage.put(s3Key, pdf, 'application/pdf');

    await this.db.transaction(async (tx) => {
      // Authoritative claim: it commits atomically with the ticket rows and the outbox row, so a
      // redelivery after any earlier failure genuinely retries (one wasted render, at worst).
      const seen = await this.inbox.alreadyProcessed(tx, event.messageId);

      if (seen) return;

      const inserted = await tx
        .insert(tickets)
        .values(
          seatTickets.map((seatTicket) => ({
            id: seatTicket.id,
            orderId: event.orderId,
            userId: event.userId,
            showId: event.showId,
            seatId: seatTicket.seatId,
            seatLabel: seatTicket.seatLabel,
            tier: seatTicket.tier,
            qrToken: seatTicket.qrToken,
            s3Key,
          })),
        )
        .onConflictDoNothing()
        .returning();

      // A different messageId for an order that already has tickets: no rows, so no second
      // ticket.pdf_ready and no duplicate email.
      if (inserted.length === 0) return;

      await this.outbox.enqueue(tx, {
        routingKey: TICKET_ROUTING_KEYS.TICKET_PDF_READY,
        payload: { messageId: randomUUID(), orderId: event.orderId, userId: event.userId },
      });
    });
  }

  /** The caller's tickets, newest first. */
  async listForUser(userId: string): Promise<TicketList> {
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.userId, userId))
      .orderBy(desc(tickets.createdAt));

    // Show title and start time are fetched, never snapshotted — a rescheduled show must display
    // its new date. One RPC per distinct show on the page, not one per ticket.
    const showIds = [...new Set(rows.map((row) => row.showId))];

    const shows = await Promise.all(
      showIds.map(async (showId) => {
        try {
          return await rpcRequest<ShowDetail>(this.amqp, SHOWS_MESSAGE_PATTERNS.DETAIL, {
            id: showId,
          });
        } catch {
          // A purged show degrades that ticket's header rather than failing the whole page — the
          // QR is still valid and still the thing that gets its holder through the gate.
          return null;
        }
      }),
    );

    const showById = new Map(shows.flatMap((show) => (show ? [[show.id, show] as const] : [])));

    const items: Ticket[] = rows.map((row) => {
      const show = showById.get(row.showId);

      return {
        id: row.id,
        orderId: row.orderId,
        showTitle: show?.title ?? 'Unavailable show',
        showStartsAt: show?.startsAt ?? row.createdAt.toISOString(),
        // ponytail: ShowDetail carries venueId, not a name — no RPC returns one yet. Null renders
        // as the card's no-venue state; wire it when shows exposes the venue.
        venueName: null,
        seatLabel: row.seatLabel,
        tier: row.tier,
        code: displayCode(row.id),
        qrToken: row.qrToken,
        // Gateway-relative and permanent, so it is safe to cache forever. The signed URL is
        // minted behind it, per click, and never enters this response.
        pdfUrl: `/tickets/${row.id}/pdf`,
        status: row.checkedInAt ? 'checked_in' : 'active',
      };
    });

    return { items };
  }

  /**
   * Mints a short-lived presigned URL for one ticket's PDF. Ownership is checked *here*, at click
   * time, rather than when the list was rendered — that is the whole reason the list carries a
   * stable path instead of a signed URL.
   */
  async pdfUrlFor(userId: string, ticketId: string): Promise<TicketPdfUrl> {
    const [ticket] = await this.db
      .select({ id: tickets.id, s3Key: tickets.s3Key })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.userId, userId)))
      .limit(1);

    // Same response whether the ticket does not exist or belongs to someone else: a 404 that
    // distinguishes the two confirms ticket ids to anyone who guesses one.
    if (!ticket) throw new NotFoundException('Ticket not found');

    const url = await this.storage.getSignedUrl(ticket.s3Key, {
      ttl: PDF_URL_TTL_SECONDS,
      filename: `ticket-${displayCode(ticket.id)}.pdf`,
    });

    return { url };
  }
}
