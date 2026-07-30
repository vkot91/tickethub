import { eq, Param, type SQL } from 'drizzle-orm';
import { fulfillmentProcessedMessages, tickets as ticketsTable } from '@tickethub/db';
import {
  ORDERS_MESSAGE_PATTERNS,
  ORDER_ROUTING_KEYS,
  SHOWS_MESSAGE_PATTERNS,
  TICKET_ROUTING_KEYS,
  type EventEnvelope,
  type EventKey,
  type OrderResponse,
  type SeatMap,
  type ShowDetail,
} from '@tickethub/contracts';
import type { OutboxMessage } from '@tickethub/outbox';
import { renderTicketPdf } from './ticket-pdf';
import { verifyTicketToken } from './qr';
import { TicketsService } from './tickets.service';

jest.mock('./ticket-pdf', () => ({ renderTicketPdf: jest.fn() }));

const renderTicketPdfMock = jest.mocked(renderTicketPdf);

const QR_SECRET = 'qr-secret';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SHOW_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_MESSAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KNOWN_SEAT_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_SEAT_ID = '66666666-6666-4666-8666-666666666666';
const TICKET_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const SECOND_ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Ticket ids are derived from (orderId, seatId) and the QR tokens are signed from them. Both are
// pinned as literals rather than recomputed with the service's own helpers, which would assert
// nothing: if the derivation or the signature ever changes, every already-issued QR silently stops
// matching its row, and these are the values that catch it.
const TICKET_ID_KNOWN_SEAT = '9cedc9ba-1f6b-567d-a4e6-86fd401f17eb';
const TICKET_ID_UNKNOWN_SEAT = '6cccd3e1-69ff-5c61-9f98-22adcb77aea3';
const TICKET_ID_SECOND_ORDER = 'd3d678e1-b696-513f-ac64-da5a23d3363f';
const QR_TOKEN_KNOWN_SEAT =
  '9cedc9ba-1f6b-567d-a4e6-86fd401f17eb.V6dV4Ystq4QrEklteepEdrZok7QDmLmY4sQ2tX_nq60';

const orderPaid: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID> = {
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
  priceTiers: [
    { id: TICKET_TYPE_ID, tier: 'vip', name: 'Loge', priceCents: 5000, currency: 'usd' },
  ],
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
          seats: [
            { id: KNOWN_SEAT_ID, number: 3, ticketTypeId: null, priceCents: null, tier: null },
          ],
        },
      ],
    },
  ],
};

interface TicketRow {
  id: string;
  orderId: string;
  userId: string;
  showId: string;
  seatId: string;
  seatLabel: string;
  tier: string;
  qrToken: string;
  s3Key: string;
  checkedInAt?: Date | null;
  createdAt?: Date;
}
type RpcCall = { routingKey: string; payload: unknown };

// Pulls the bound values out of a Drizzle condition, so the db fake can answer from its own
// state instead of pattern-matching on call order. Walks nested SQL because `and(...)` wraps each
// operand, and collects raw string chunks as well as Params: drizzle inlines a uuid comparison as
// a plain string rather than binding it.
function boundValuesOf(condition: SQL): string[] {
  const values: string[] = [];

  const walk = (sql: SQL): void => {
    for (const chunk of sql.queryChunks) {
      if (chunk instanceof Param) values.push(String(chunk.value));
      else if (typeof chunk === 'string') values.push(chunk);
      else if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) walk(chunk as SQL);
    }
  };

  walk(condition);

  return values;
}

interface FakeOptions {
  // Message ids already committed to fulfillment.processed_messages.
  committedMessageIds?: string[];
  // (orderId, seatId) pairs that already have a ticket row — the UNIQUE constraint the insert
  // conflicts on.
  ticketedOrderSeats?: string[];
  // Rows the read paths (listForUser / pdfUrlFor) should find.
  existingTickets?: TicketRow[];
}

const orderSeatKey = (row: { orderId: string; seatId: string }) => `${row.orderId}:${row.seatId}`;

function makeFakes({
  committedMessageIds = [],
  ticketedOrderSeats = [],
  existingTickets = [],
}: FakeOptions = {}) {
  const processedMessageIds = new Set(committedMessageIds);
  const takenOrderSeats = new Set(ticketedOrderSeats);
  const storedTickets = [...existingTickets];

  // Every row the service *tried* to insert, including the ones the UNIQUE conflict discarded,
  // so a losing delivery's ticket ids and qr tokens stay observable.
  const attemptedTickets: TicketRow[] = [];
  const insertedTickets: TicketRow[] = [];
  const conflictHandled: boolean[] = [];
  const selectedTables: unknown[] = [];
  const selectedConditions: SQL[] = [];
  const enqueued: OutboxMessage<EventKey>[] = [];

  const tx = {
    insert: () => ({
      values: (rows: TicketRow[]) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            conflictHandled.push(true);
            attemptedTickets.push(...rows);

            const fresh = rows.filter((row) => !takenOrderSeats.has(orderSeatKey(row)));

            for (const row of fresh) {
              takenOrderSeats.add(orderSeatKey(row));
              insertedTickets.push(row);
              storedTickets.push(row);
            }

            return fresh;
          },
        }),
      }),
    }),
  };

  const rowsMatching = (table: unknown, condition: SQL) => {
    if (table === fulfillmentProcessedMessages) {
      const [messageId] = boundValuesOf(condition);

      return processedMessageIds.has(String(messageId)) ? [{ messageId }] : [];
    }

    // Every bound value in the condition must appear somewhere on the row — enough to model
    // eq(userId) and and(eq(id), eq(userId)) without reimplementing Drizzle.
    const bound = boundValuesOf(condition);

    return storedTickets.filter((row) =>
      bound.every((value) => Object.values(row).map(String).includes(value)),
    );
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          selectedTables.push(table);
          selectedConditions.push(condition);

          const resolve = async () => rowsMatching(table, condition);

          return { limit: resolve, orderBy: resolve };
        },
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

  const storage = {
    put: jest.fn(async (_key: string, _body: Buffer, _contentType: string) => {}),
    getSignedUrl: jest.fn(async (key: string) => `https://minio.test/${key}?X-Amz-Signature=abc`),
  };

  const outbox = {
    enqueue: jest.fn(async (_tx: unknown, message: OutboxMessage<EventKey>) => {
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
    storage,
    outbox,
    inbox,
    enqueued,
    attemptedTickets,
    insertedTickets,
    storedTickets,
    conflictHandled,
    selectedTables,
    selectedConditions,
    processedMessageIds,
  };
}

const serviceFor = (fakes: ReturnType<typeof makeFakes>) =>
  new TicketsService(
    fakes.db as never,
    fakes.storage as never,
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
    expect(fakes.storage.put).not.toHaveBeenCalled();
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

  it('renders one pdf page per seat, with its own QR and the organizer’s tier wording', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(renderTicketPdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showTitle: 'Radiohead Live',
        startsAt: show.startsAt,
        orderId: ORDER_ID,
        seats: [
          // Section "A", row 1, seat 3 — the one system-wide format, shared with the gateway.
          expect.objectContaining({ seatLabel: 'A A3', tier: 'Loge' }),
          // A seat missing from the map still gets a ticket — falling back to its raw id beats
          // failing the whole order.
          expect.objectContaining({ seatLabel: UNKNOWN_SEAT_ID, tier: 'Loge' }),
        ],
      }),
    );

    const [{ seats }] = renderTicketPdfMock.mock.calls[0];
    expect(seats).toHaveLength(2);

    for (const seat of seats) {
      expect(Buffer.isBuffer(seat.qrPng)).toBe(true);
      expect(seat.qrPng.length).toBeGreaterThan(0);
    }

    // Distinct QRs, not the same code copied onto both pages.
    expect(seats[0].qrPng.equals(seats[1].qrPng)).toBe(false);
  });

  it('falls back to a generic tier when no price tier matches the ticket type', async () => {
    const fakes = makeFakes();

    fakes.amqp.request.mockImplementation(async ({ routingKey }: RpcCall) => {
      if (routingKey === ORDERS_MESSAGE_PATTERNS.GET) return order;
      if (routingKey === SHOWS_MESSAGE_PATTERNS.DETAIL) return { ...show, priceTiers: [] };
      if (routingKey === SHOWS_MESSAGE_PATTERNS.SEAT_MAP) return seatMap;

      throw new Error(`unexpected rpc: ${routingKey}`);
    });

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.insertedTickets.map((ticket) => ticket.tier)).toEqual(['Standard', 'Standard']);
  });

  it('stores one pdf under the order-scoped key so a redelivery overwrites it', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.storage.put).toHaveBeenCalledTimes(1);
    expect(fakes.storage.put).toHaveBeenCalledWith(
      `${ORDER_ID}.pdf`,
      Buffer.from('rendered-pdf'),
      'application/pdf',
    );
  });

  it('inserts one row per seat, each with its own verifiable qr token', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.insertedTickets).toHaveLength(2);

    const [first, second] = fakes.insertedTickets;

    expect(first.id).toBe(TICKET_ID_KNOWN_SEAT);
    expect(second.id).toBe(TICKET_ID_UNKNOWN_SEAT);
    expect(first.qrToken).toBe(QR_TOKEN_KNOWN_SEAT);

    for (const ticket of fakes.insertedTickets) {
      expect(ticket.orderId).toBe(ORDER_ID);
      expect(ticket.userId).toBe(USER_ID);
      expect(ticket.showId).toBe(SHOW_ID);
      expect(ticket.s3Key).toBe(`${ORDER_ID}.pdf`);
      expect(verifyTicketToken(ticket.qrToken, QR_SECRET)).toBe(ticket.id);
      expect(verifyTicketToken(ticket.qrToken, 'other-secret')).toBeNull();
    }

    expect(fakes.conflictHandled).toEqual([true]);
  });

  it('enqueues ticket.pdf_ready once for the order, not once per seat', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.enqueued).toHaveLength(1);

    const [message] = fakes.enqueued;
    expect(message.routingKey).toBe(TICKET_ROUTING_KEYS.TICKET_PDF_READY);

    // Domain fields only. The outgoing messageId is minted by the outbox, so this service cannot
    // forward the inbound one — which would make a redelivery look like a fresh message to every
    // consumer downstream. That used to be a hand-written `randomUUID()` one typo away from
    // `event.messageId`; it is now structural. The stamp itself is OutboxRepository's own spec.
    expect(message.payload).toEqual({ orderId: ORDER_ID, userId: USER_ID });
  });

  it('claims the message inside the write transaction, alongside the ticket rows', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.inbox.alreadyProcessed).toHaveBeenCalledWith(fakes.tx, MESSAGE_ID);
  });

  it('writes nothing when a concurrent delivery claimed the message while we were rendering', async () => {
    const fakes = makeFakes();

    // The other delivery commits its claim after our pre-check has already missed.
    fakes.storage.put.mockImplementation(async () => {
      fakes.processedMessageIds.add(MESSAGE_ID);
    });

    await serviceFor(fakes).handleOrderPaid(orderPaid);

    expect(fakes.inbox.alreadyProcessed).toHaveBeenCalledWith(fakes.tx, MESSAGE_ID);
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not re-emit ticket.pdf_ready when the order already has its tickets', async () => {
    const fakes = makeFakes({
      ticketedOrderSeats: [`${ORDER_ID}:${KNOWN_SEAT_ID}`, `${ORDER_ID}:${UNKNOWN_SEAT_ID}`],
    });

    await serviceFor(fakes).handleOrderPaid({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    expect(fakes.conflictHandled).toEqual([true]);
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();

    // The losing delivery still rendered and overwrote `<orderId>.pdf`. That is harmless only
    // because it signed the very tokens the winner persisted, so the object still matches the rows.
    const [losingAttempt] = fakes.attemptedTickets;
    expect(losingAttempt.id).toBe(TICKET_ID_KNOWN_SEAT);
    expect(losingAttempt.qrToken).toBe(QR_TOKEN_KNOWN_SEAT);
  });

  it('reuses the same ticket ids, qr tokens and pdf for every delivery of one order', async () => {
    const fakes = makeFakes();
    const service = serviceFor(fakes);

    await service.handleOrderPaid(orderPaid);
    await service.handleOrderPaid({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    const [winner, , loser] = fakes.attemptedTickets;
    expect(winner.id).toBe(TICKET_ID_KNOWN_SEAT);
    expect(winner.qrToken).toBe(QR_TOKEN_KNOWN_SEAT);
    expect(loser.id).toBe(winner.id);
    expect(loser.qrToken).toBe(winner.qrToken);

    // Same key, byte-identical body: the second put overwrites the first with the same object.
    // This is the property derived ticket ids exist to protect — a random id would have written a
    // different document over the one whose tokens are in the database.
    expect(fakes.storage.put).toHaveBeenCalledTimes(2);
    const [firstPut, secondPut] = fakes.storage.put.mock.calls;
    expect(secondPut).toEqual(firstPut);

    const [persisted] = fakes.insertedTickets;
    expect(verifyTicketToken(persisted.qrToken, QR_SECRET)).toBe(persisted.id);
  });

  it('uses different ticket ids for the same seat in a different order', async () => {
    const fakes = makeFakes();

    await serviceFor(fakes).handleOrderPaid({ ...orderPaid, orderId: SECOND_ORDER_ID });

    const [ticket] = fakes.insertedTickets;
    expect(ticket.id).toBe(TICKET_ID_SECOND_ORDER);
    expect(ticket.id).not.toBe(TICKET_ID_KNOWN_SEAT);
    expect(verifyTicketToken(ticket.qrToken, QR_SECRET)).toBe(TICKET_ID_SECOND_ORDER);
  });

  it('replays a failed delivery: the retry mints exactly one set of tickets and one outbox row', async () => {
    const fakes = makeFakes();
    const service = serviceFor(fakes);

    fakes.storage.put.mockRejectedValueOnce(new Error('s3 blip'));

    await expect(service.handleOrderPaid(orderPaid)).rejects.toThrow('s3 blip');

    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.enqueued).toEqual([]);

    await service.handleOrderPaid(orderPaid);

    expect(fakes.insertedTickets).toHaveLength(2);
    expect(fakes.enqueued).toHaveLength(1);
  });

  it('propagates an s3 failure so the message is nacked, without writing the tickets', async () => {
    const fakes = makeFakes();

    fakes.storage.put.mockRejectedValueOnce(new Error('s3 down'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('s3 down');

    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('propagates an rpc failure so the message is nacked, without writing the tickets', async () => {
    const fakes = makeFakes();

    fakes.amqp.request.mockRejectedValueOnce(new Error('orders rpc down'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('orders rpc down');

    expect(renderTicketPdfMock).not.toHaveBeenCalled();
    expect(fakes.storage.put).not.toHaveBeenCalled();
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('propagates a pdf render failure so the message is nacked, without writing the tickets', async () => {
    const fakes = makeFakes();

    renderTicketPdfMock.mockRejectedValueOnce(new Error('pdf render failed'));

    await expect(serviceFor(fakes).handleOrderPaid(orderPaid)).rejects.toThrow('pdf render failed');

    expect(fakes.storage.put).not.toHaveBeenCalled();
    expect(fakes.insertedTickets).toEqual([]);
    expect(fakes.outbox.enqueue).not.toHaveBeenCalled();
  });
});

const storedTicket = (overrides: Partial<TicketRow> = {}): TicketRow => ({
  id: TICKET_ID_KNOWN_SEAT,
  orderId: ORDER_ID,
  userId: USER_ID,
  showId: SHOW_ID,
  seatId: KNOWN_SEAT_ID,
  seatLabel: 'Loge A3',
  tier: 'Loge',
  qrToken: QR_TOKEN_KNOWN_SEAT,
  s3Key: `${ORDER_ID}.pdf`,
  checkedInAt: null,
  createdAt: new Date('2026-07-20T10:00:00.000Z'),
  ...overrides,
});

describe('TicketsService.listForUser', () => {
  it('scopes the query to the caller', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    await serviceFor(fakes).listForUser(USER_ID);

    expect(fakes.selectedTables).toEqual([ticketsTable]);
    expect(fakes.selectedConditions).toEqual([eq(ticketsTable.userId, USER_ID)]);
  });

  it('returns nothing for a user with no tickets, without calling shows', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    const list = await serviceFor(fakes).listForUser(OTHER_USER_ID);

    expect(list.items).toEqual([]);
    expect(fakes.amqp.request).not.toHaveBeenCalled();
  });

  it('joins the live show title and start time rather than a snapshot', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    const { items } = await serviceFor(fakes).listForUser(USER_ID);

    expect(items).toEqual([
      expect.objectContaining({
        id: TICKET_ID_KNOWN_SEAT,
        orderId: ORDER_ID,
        showTitle: 'Radiohead Live',
        showStartsAt: show.startsAt,
        seatLabel: 'Loge A3',
        tier: 'Loge',
        qrToken: QR_TOKEN_KNOWN_SEAT,
        status: 'active',
      }),
    ]);
  });

  // A rescheduled show must display its new date, which is the whole reason the title and time
  // are fetched rather than persisted on the row.
  it('follows the show when it moves', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    fakes.amqp.request.mockResolvedValue({ ...show, startsAt: '2026-09-09T20:00:00.000Z' });

    const { items } = await serviceFor(fakes).listForUser(USER_ID);

    expect(items[0].showStartsAt).toBe('2026-09-09T20:00:00.000Z');
  });

  it('fetches each distinct show once, not once per ticket', async () => {
    const fakes = makeFakes({
      existingTickets: [
        storedTicket(),
        storedTicket({ id: TICKET_ID_UNKNOWN_SEAT, seatId: UNKNOWN_SEAT_ID, seatLabel: 'Loge A4' }),
      ],
    });

    await serviceFor(fakes).listForUser(USER_ID);

    expect(fakes.amqp.request).toHaveBeenCalledTimes(1);
  });

  it('degrades a purged show instead of failing the whole page', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    fakes.amqp.request.mockRejectedValue(new Error('shows rpc down'));

    const { items } = await serviceFor(fakes).listForUser(USER_ID);

    expect(items[0].showTitle).toBe('Unavailable show');
    // The QR is still the thing that gets its holder through the gate.
    expect(items[0].qrToken).toBe(QR_TOKEN_KNOWN_SEAT);
  });

  it('carries a stable app path for the pdf, never a signed url', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    const { items } = await serviceFor(fakes).listForUser(USER_ID);

    expect(items[0].pdfUrl).toBe(`/tickets/${TICKET_ID_KNOWN_SEAT}/pdf`);
    // A perishable credential in a cacheable list response is the bug this shape exists to avoid.
    expect(fakes.storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('reports a scanned ticket as checked in', async () => {
    const fakes = makeFakes({
      existingTickets: [storedTicket({ checkedInAt: new Date('2026-08-01T18:05:00.000Z') })],
    });

    const { items } = await serviceFor(fakes).listForUser(USER_ID);

    expect(items[0].status).toBe('checked_in');
  });
});

describe('TicketsService.pdfUrlFor', () => {
  it('mints a short-lived signed url for the ticket’s object', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    const { url } = await serviceFor(fakes).pdfUrlFor(USER_ID, TICKET_ID_KNOWN_SEAT);

    expect(fakes.storage.getSignedUrl).toHaveBeenCalledWith(
      `${ORDER_ID}.pdf`,
      expect.objectContaining({ ttl: 60 }),
    );
    expect(url).toContain('X-Amz-Signature');
  });

  it('names the download after the ticket', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    await serviceFor(fakes).pdfUrlFor(USER_ID, TICKET_ID_KNOWN_SEAT);

    expect(fakes.storage.getSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ filename: 'ticket-TH-9CED-C9BA.pdf' }),
    );
  });

  // Authorization happens here, at click time — not when the list was rendered. Someone else's
  // ticket id must not mint a URL, and must not be distinguishable from one that does not exist.
  it('refuses another user’s ticket without confirming it exists', async () => {
    const fakes = makeFakes({ existingTickets: [storedTicket()] });

    await expect(serviceFor(fakes).pdfUrlFor(OTHER_USER_ID, TICKET_ID_KNOWN_SEAT)).rejects.toThrow(
      'Ticket not found',
    );

    await expect(
      serviceFor(fakes).pdfUrlFor(OTHER_USER_ID, TICKET_ID_SECOND_ORDER),
    ).rejects.toThrow('Ticket not found');

    expect(fakes.storage.getSignedUrl).not.toHaveBeenCalled();
  });
});
