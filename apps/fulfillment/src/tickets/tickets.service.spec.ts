import { eq, Param, type SQL } from 'drizzle-orm';
import { fulfillmentProcessedMessages } from '@tickethub/db';
import {
  ORDERS_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  TICKET_ROUTING_KEYS,
  type OrderPaidEvent,
  type OrderResponse,
  type SeatMap,
  type ShowDetail,
} from '@tickethub/contracts';
import type { OutboxMessage } from '@tickethub/outbox';
import { renderTicketPdf } from '../pdf/pdf';
import { verifyTicketToken } from '../pdf/qr';
import { TicketsService } from './tickets.service';

jest.mock('../pdf/pdf', () => ({ renderTicketPdf: jest.fn() }));

const renderTicketPdfMock = jest.mocked(renderTicketPdf);

const QR_SECRET = 'qr-secret';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SHOW_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_MESSAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KNOWN_SEAT_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_SEAT_ID = '66666666-6666-4666-8666-666666666666';
const TICKET_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const SECOND_ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// There is exactly one ticket per order, so the ticket id IS the order id. The QR token literal is
// pinned rather than recomputed: signing it here with the same helper the service uses would assert
// nothing. If the token format or the signature ever changes, every issued QR stops matching.
const TICKET_ID_FOR_ORDER = ORDER_ID;
const TICKET_ID_FOR_SECOND_ORDER = SECOND_ORDER_ID;
const QR_TOKEN_FOR_ORDER =
  '11111111-1111-4111-8111-111111111111.ICI-gKFqtynWjq4bvqmx5EAjiRqqfd8qraO88mOBmqY';

const orderPaid: OrderPaidEvent = {
  messageId: MESSAGE_ID,
  orderId: ORDER_ID,
  userId: USER_ID,
  showId: SHOW_ID,
};

const order: OrderResponse = {
  id: ORDER_ID,
  status: 'paid',
  totalCents: 5000,
  currency: 'usd',
  expiresAt: '2026-07-22T10:00:00.000Z',
  seats: [
    { seatId: KNOWN_SEAT_ID, ticketTypeId: TICKET_TYPE_ID },
    { seatId: UNKNOWN_SEAT_ID, ticketTypeId: TICKET_TYPE_ID },
  ],
};

const show: ShowDetail = {
  id: SHOW_ID,
  title: 'Radiohead Live',
  description: 'A concert',
  startsAt: '2026-08-01T18:00:00.000Z',
  posterUrl: null,
  status: 'published',
  venueId: '88888888-8888-4888-8888-888888888888',
};

const seatMap: SeatMap = {
  showId: SHOW_ID,
  sections: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'A',
      rows: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          number: 1,
          seats: [{ id: KNOWN_SEAT_ID, number: 3 }],
        },
      ],
    },
  ],
};

type TicketInsert = { id: string; orderId: string; s3Key: string; qrToken: string };
type RpcCall = { routingKey: string; payload: unknown };

// Pulls the bound values out of a Drizzle condition, so the db fake can answer the
// pre-check `SELECT` from its own state instead of pattern-matching on call order.
function boundValuesOf(condition: SQL): unknown[] {
  return condition.queryChunks.flatMap((chunk) => (chunk instanceof Param ? [chunk.value] : []));
}

interface FakeOptions {
  // Message ids already committed to fulfillment.processed_messages.
  committedMessageIds?: string[];
  // Order ids that already have a ticket row (the UNIQUE constraint the insert conflicts on).
  ticketedOrderIds?: string[];
}

function makeFakes({ committedMessageIds = [], ticketedOrderIds = [] }: FakeOptions = {}) {
  const processedMessageIds = new Set(committedMessageIds);
  const orderIdsWithTicket = new Set(ticketedOrderIds);

  // Every row the service *tried* to insert, including the ones the UNIQUE conflict discarded,
  // so a losing delivery's ticket id and qr token stay observable.
  const attemptedTickets: TicketInsert[] = [];
  const insertedTickets: TicketInsert[] = [];
  const conflictHandled: boolean[] = [];
  const selectedTables: unknown[] = [];
  const selectedConditions: SQL[] = [];
  const enqueued: OutboxMessage[] = [];

  const tx = {
    insert: () => ({
      values: (values: TicketInsert) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            conflictHandled.push(true);
            attemptedTickets.push(values);

            if (orderIdsWithTicket.has(values.orderId)) return [];

            orderIdsWithTicket.add(values.orderId);
            insertedTickets.push(values);

            return [values];
          },
        }),
      }),
    }),
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => ({
          limit: async () => {
            selectedTables.push(table);
            selectedConditions.push(condition);

            const [messageId] = boundValuesOf(condition);

            return processedMessageIds.has(String(messageId)) ? [{ messageId }] : [];
          },
        }),
      }),
    }),
    transaction: async <T>(fn: (handle: typeof tx) => Promise<T> | T): Promise<T> => fn(tx),
  };

  const amqp = {
    request: jest.fn(async ({ routingKey }: RpcCall) => {
      if (routingKey === ORDERS_MESSAGE_PATTERNS.GET) return order;
      if (routingKey === SHOWS_MESSAGE_PATTERNS.DETAIL) return show;
      if (routingKey === SHOWS_MESSAGE_PATTERNS.SEAT_MAP) return seatMap;

      throw new Error(`unexpected rpc: ${routingKey}`);
    }),
  };

  const s3 = {
    put: jest.fn(async (_key: string, _body: Buffer, _contentType: string) => {}),
  };

  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, message: OutboxMessage) => {
      enqueued.push(message);
    }),
  };

  // Mirrors InboxRepository: insert-on-conflict, so the claim is only true on a replay.
  const inbox = {
    alreadyProcessed: jest.fn(async (_tx: unknown, messageId: string) => {
      if (processedMessageIds.has(messageId)) return true;

      processedMessageIds.add(messageId);

      return false;
    }),
  };

  return {
    db,
    tx,
    amqp,
    s3,
    outbox,
    inbox,
    enqueued,
    attemptedTickets,
    insertedTickets,
    conflictHandled,
    selectedTables,
    selectedConditions,
    processedMessageIds,
  };
}

const serviceFor = (fakes: ReturnType<typeof makeFakes>) =>
  new TicketsService(
    fakes.db as never,
    fakes.s3 as never,
    fakes.amqp as never,
    fakes.outbox as never,
    fakes.inbox as never,
    QR_SECRET,
  );

describe('TicketsService.handleOrderPaid', () => {
  beforeEach(() => {
    renderTicketPdfMock.mockReset();
    renderTicketPdfMock.mockResolvedValue(Buffer.from('rendered-pdf'));
  });

  it('is a no-op when the message was already processed', async () => {
    const fakes = makeFakes({ committedMessageIds: [MESSAGE_ID] });

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.amqp.request).not.toHaveBeenCalled();
    expect(renderTicketPdfMock).not.toHaveBeenCalled();
    expect(fakes.s3.put).not.toHaveBeenCalled();
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
    expect(fakes.insertedTickets).toEqual([]);
  });

  it('pre-checks the inbox with a read-only select, never a claiming insert', async () => {
    const fakes = makeFakes({ committedMessageIds: [MESSAGE_ID] });

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.selectedTables).toEqual([fulfillmentProcessedMessages]);
    expect(fakes.selectedConditions).toEqual([
      eq(fulfillmentProcessedMessages.messageId, MESSAGE_ID),
    ]);
    expect(fakes.inbox.alreadyProcessed).not.toHaveBeenCalled();
  });

  it('fetches the order, the show and the seat map over RPC', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: ORDERS_MESSAGE_PATTERNS.GET,
        payload: { userId: USER_ID, orderId: ORDER_ID },
      }),
    );
    expect(fakes.amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: SHOWS_MESSAGE_PATTERNS.DETAIL,
        payload: { id: SHOW_ID },
      }),
    );
    expect(fakes.amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
        payload: { id: SHOW_ID },
      }),
    );
  });

  it('renders the pdf with seat-map labels, falling back to the raw seat id', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(renderTicketPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showTitle: 'Radiohead Live',
        startsAt: show.startsAt,
        orderId: ORDER_ID,
        seatLabels: ['A 1-3', UNKNOWN_SEAT_ID],
      }),
    );

    const [{ qrPng }] = renderTicketPdfMock.mock.calls[0];
    expect(Buffer.isBuffer(qrPng)).toBe(true);
    expect(qrPng.length).toBeGreaterThan(0);
  });

  it('stores the pdf under the order-scoped key so a redelivery overwrites it', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.s3.put).toHaveBeenCalledTimes(1);
    expect(fakes.s3.put).toHaveBeenCalledWith(
      `${ORDER_ID}.pdf`,
      Buffer.from('rendered-pdf'),
      'application/pdf',
    );
  });

  it('inserts the ticket row with a verifiable qr token, ignoring a conflicting redelivery', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.insertedTickets).toHaveLength(1);

    const [ticket] = fakes.insertedTickets;
    expect(ticket.orderId).toBe(ORDER_ID);
    expect(ticket.s3Key).toBe(`${ORDER_ID}.pdf`);
    expect(verifyTicketToken(ticket.qrToken, QR_SECRET)).toBe(ticket.id);
    expect(verifyTicketToken(ticket.qrToken, 'other-secret')).toBeNull();
    expect(fakes.conflictHandled).toEqual([true]);
  });

  it('enqueues ticket.pdf_ready on the outbox in the same transaction as the ticket row', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.enqueued).toHaveLength(1);

    const [message] = fakes.enqueued;
    expect(message.routingKey).toBe(TICKET_ROUTING_KEYS.TICKET_PDF_READY);
    expect(message.payload).toEqual({
      messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      orderId: ORDER_ID,
      userId: USER_ID,
    });
    expect(message.payload.messageId).not.toBe(MESSAGE_ID);
  });

  it('claims the message inside the write transaction, alongside the ticket row', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.inbox.alreadyProcessed).toHaveBeenCalledWith(fakes.tx, MESSAGE_ID);
  });

  it('writes nothing when a concurrent delivery claimed the message while we were rendering', async () => {
    const fakes = makeFakes();

    // The other delivery commits its claim after our pre-check has already missed.
    fakes.s3.put.mockImplementation(async () => {
      fakes.processedMessageIds.add(MESSAGE_ID);
    });

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.inbox.alreadyProcessed).toHaveBeenCalledWith(fakes.tx, MESSAGE_ID);
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not re-emit ticket.pdf_ready when the order already has a ticket', async () => {
    const fakes = makeFakes({ ticketedOrderIds: [ORDER_ID] });

    await serviceFor(fakes).handleOrderPaid({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    expect(fakes.conflictHandled).toEqual([true]);
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();

    // The losing delivery still rendered and overwrote `<orderId>.pdf`. That is harmless only
    // because it signed the very token the winner persisted, so the object still matches the row.
    const [losingAttempt] = fakes.attemptedTickets;
    expect(losingAttempt.id).toBe(TICKET_ID_FOR_ORDER);
    expect(losingAttempt.qrToken).toBe(QR_TOKEN_FOR_ORDER);
  });

  it('reuses the same ticket id, qr token and pdf for every delivery of one order', async () => {
    const fakes = makeFakes();
    const service = serviceFor(fakes);

    await service.handleOrderPaid(orderPaid);
    await service.handleOrderPaid({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    const [winner, loser] = fakes.attemptedTickets;
    expect(winner.id).toBe(TICKET_ID_FOR_ORDER);
    expect(winner.qrToken).toBe(QR_TOKEN_FOR_ORDER);
    expect(loser.id).toBe(winner.id);
    expect(loser.qrToken).toBe(winner.qrToken);

    // Same key, byte-identical body: the second put overwrites the first with the same object.
    expect(fakes.s3.put).toHaveBeenCalledTimes(2);
    const [firstPut, secondPut] = fakes.s3.put.mock.calls;
    expect(secondPut).toEqual(firstPut);

    // And the token that survived in the ticket row still resolves to the persisted ticket id.
    const [persisted] = fakes.insertedTickets;
    expect(verifyTicketToken(persisted.qrToken, QR_SECRET)).toBe(persisted.id);
  });

  it('uses a different ticket id for a different order', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid({ ...orderPaid, orderId: SECOND_ORDER_ID });

    const [ticket] = fakes.insertedTickets;
    expect(ticket.id).toBe(TICKET_ID_FOR_SECOND_ORDER);
    expect(ticket.id).not.toBe(TICKET_ID_FOR_ORDER);
    expect(verifyTicketToken(ticket.qrToken, QR_SECRET)).toBe(TICKET_ID_FOR_SECOND_ORDER);
  });

  it('replays a failed delivery: the retry mints exactly one ticket and one outbox row', async () => {
    const fakes = makeFakes();
    const service = serviceFor(fakes);

    fakes.s3.put.mockRejectedValueOnce(new Error('s3 blip'));

    await expect(service.handleOrderPaid(orderPaid)).rejects.toThrow('s3 blip');

    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.enqueued).toEqual([]);

    await service.handleOrderPaid(orderPaid);

    expect(fakes.insertedTickets).toHaveLength(1);
    expect(fakes.enqueued).toHaveLength(1);
  });

  it('propagates an s3 failure so the message is nacked, without writing the ticket', async () => {
    const fakes = makeFakes();

    fakes.s3.put.mockRejectedValueOnce(new Error('s3 down'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('s3 down');

    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('propagates an rpc failure so the message is nacked, without writing the ticket', async () => {
    const fakes = makeFakes();

    fakes.amqp.request.mockRejectedValueOnce(new Error('orders rpc down'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('orders rpc down');

    expect(renderTicketPdfMock).not.toHaveBeenCalled();
    expect(fakes.s3.put).not.toHaveBeenCalled();
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('propagates a pdf render failure so the message is nacked, without writing the ticket', async () => {
    const fakes = makeFakes();

    renderTicketPdfMock.mockRejectedValueOnce(new Error('pdf render failed'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('pdf render failed');

    expect(fakes.s3.put).not.toHaveBeenCalled();
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });
});
