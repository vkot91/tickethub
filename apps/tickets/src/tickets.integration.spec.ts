import { S3Client as AwsS3, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';

import {
  ORDER_ROUTING_KEYS,
  ORDERS_MESSAGE_PATTERNS,
  SHOWS_MESSAGE_PATTERNS,
  TICKET_ROUTING_KEYS,
  type EventEnvelope,
  type OrderResponse,
  type SeatMap,
  type ShowDetail,
} from '@tickethub/contracts';
import { createDb, tickets, ticketsOutbox, ticketsProcessedMessages, type Db } from '@tickethub/db';
import { loadEnv, requireEnv } from '@tickethub/env';
import { InboxRepository, OutboxRepository } from '@tickethub/outbox';
import { StorageClient } from '@tickethub/storage';

import { verifyTicketToken } from './qr';
import { TicketsService } from './tickets.service';

jest.setTimeout(30_000);

const ORDER_ID = '11111111-1111-4111-8111-1111110000aa';
const USER_ID = '22222222-2222-4222-8222-2222220000aa';
const SHOW_ID = '33333333-3333-4333-8333-3333330000aa';
const MESSAGE_ID = '44444444-4444-4444-8444-4444440000aa';
const REDELIVERED_MESSAGE_ID = MESSAGE_ID;
const OTHER_MESSAGE_ID = '55555555-5555-4555-8555-5555550000aa';
const SEAT_ID = '66666666-6666-4666-8666-6666660000aa';
const SECOND_SEAT_ID = '66666666-6666-4666-8666-6666660000bb';
const OTHER_USER_ID = '99999999-9999-4999-8999-9999990000ff';
const BAND_ID = '77777777-7777-4777-8777-7777770000aa';

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
  seats: [{ seatId: SEAT_ID, bandId: BAND_ID }],
};

const show: ShowDetail = {
  id: SHOW_ID,
  title: 'Radiohead Live',
  description: 'A concert',
  startsAt: '2026-08-01T18:00:00.000Z',
  posterUrl: null,
  status: 'published',
  venueId: '88888888-8888-4888-8888-8888880000aa',
  priceTiers: [{ id: BAND_ID, tier: 'vip', name: 'Loge', priceCents: 5000, currency: 'usd' }],
};

// The seat the order carries lives in this map, so the rendered pdf gets a human label ("A A3")
// rather than the raw seat id fallback.
const seatMap: SeatMap = {
  showId: SHOW_ID,
  sections: [
    {
      id: '99999999-9999-4999-8999-9999990000aa',
      name: 'A',
      rows: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaa0000aa',
          number: 1,
          seats: [{ id: SEAT_ID, number: 3, bandId: null, priceCents: null, tier: null }],
        },
      ],
    },
  ],
};

// Matches how `rpcRequest` calls the connection: `amqp.request({ exchange, routingKey, payload })`.
// Every RPC the service makes is answered from the canned responses above — no broker involved.
function makeAmqpStub() {
  const requestedRoutingKeys: string[] = [];

  const request = async ({ routingKey }: { routingKey: string }): Promise<unknown> => {
    requestedRoutingKeys.push(routingKey);

    if (routingKey === ORDERS_MESSAGE_PATTERNS.GET) return order;
    if (routingKey === SHOWS_MESSAGE_PATTERNS.DETAIL) return show;
    if (routingKey === SHOWS_MESSAGE_PATTERNS.SEAT_MAP) return seatMap;

    throw new Error(`unexpected rpc routing key: ${routingKey}`);
  };

  return { request, requestedRoutingKeys };
}

describe('Tickets order.paid idempotency (integration: real Postgres + real MinIO)', () => {
  const s3Key = `${ORDER_ID}.pdf`;

  let db: Db;
  let storage: StorageClient;
  let rawS3: AwsS3;
  let bucket: string;
  let qrSecret: string;
  let amqpStub: ReturnType<typeof makeAmqpStub>;
  let ticketsService: TicketsService;

  beforeAll(() => {
    loadEnv();

    db = createDb(requireEnv('DATABASE_URL'));

    const endpoint = requireEnv('S3_ENDPOINT');
    const accessKey = requireEnv('S3_ACCESS_KEY');
    const secretKey = requireEnv('S3_SECRET_KEY');

    bucket = requireEnv('S3_BUCKET_TICKETS');
    qrSecret = requireEnv('TICKET_QR_SECRET');

    storage = new StorageClient({ endpoint, accessKey, secretKey, bucket });

    // Used only by the test itself, to count and clear objects — the service never sees it.
    rawS3 = new AwsS3({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate ${tickets}, ${sql.raw('"tickets"."outbox"')}, ${sql.raw('"tickets"."processed_messages"')} restart identity cascade`,
    );

    await rawS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));

    amqpStub = makeAmqpStub();

    ticketsService = new TicketsService(
      db,
      storage,
      amqpStub as never,
      new OutboxRepository(db, ticketsOutbox),
      new InboxRepository(ticketsProcessedMessages),
      qrSecret,
    );
  });

  // There is no TEST_S3_BUCKET the way there is a TEST_DATABASE_URL, so the suite shares the dev
  // bucket and has to put its one fixed key back the way it found it — otherwise the last test
  // leaves a stray pdf behind. ponytail: cleanup, not isolation; a dedicated bucket only becomes
  // worth it if a suite ever writes keys it cannot name up front.
  afterAll(async () => {
    await rawS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
  });

  const countStoredObjects = async (): Promise<number> => {
    const listed = await rawS3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: ORDER_ID }));

    return listed.Contents?.length ?? 0;
  };

  it('writes exactly one ticket row, one pdf object and one outbox row', async () => {
    await ticketsService.issue(orderPaid);

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(ticketsOutbox);

    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].orderId).toBe(ORDER_ID);
    expect(ticketRows[0].s3Key).toBe(s3Key);
    expect(verifyTicketToken(ticketRows[0].qrToken, qrSecret)).toBe(ticketRows[0].id);

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].routingKey).toBe(TICKET_ROUTING_KEYS.TICKET_PDF_READY);
    expect(outboxRows[0].payload).toEqual({
      messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      orderId: ORDER_ID,
      userId: USER_ID,
    });

    expect(await countStoredObjects()).toBe(1);

    // Fetched back from MinIO, not merely "put was called": the bytes are a real pdf.
    const storedPdf = await storage.get(s3Key);
    expect(storedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(storedPdf.length).toBeGreaterThan(1000);

    expect(amqpStub.requestedRoutingKeys).toEqual([
      ORDERS_MESSAGE_PATTERNS.GET,
      SHOWS_MESSAGE_PATTERNS.DETAIL,
      SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
    ]);
  });

  it('adds nothing on a duplicate delivery of the same message', async () => {
    await ticketsService.issue(orderPaid);

    const [firstTicket] = await db.select().from(tickets);
    const pdfAfterFirstDelivery = await storage.get(s3Key);

    await ticketsService.issue({ ...orderPaid, messageId: REDELIVERED_MESSAGE_ID });

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(ticketsOutbox);

    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].id).toBe(firstTicket.id);
    expect(ticketRows[0].qrToken).toBe(firstTicket.qrToken);

    expect(outboxRows).toHaveLength(1);

    expect(await countStoredObjects()).toBe(1);
    expect(await storage.get(s3Key)).toEqual(pdfAfterFirstDelivery);

    // The redelivery short-circuited on the committed claim, so it never even asked orders.
    expect(amqpStub.requestedRoutingKeys).toEqual([
      ORDERS_MESSAGE_PATTERNS.GET,
      SHOWS_MESSAGE_PATTERNS.DETAIL,
      SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
    ]);
  });

  it('adds no second ticket or outbox row for a different message about the same order', async () => {
    await ticketsService.issue(orderPaid);

    const [firstTicket] = await db.select().from(tickets);

    await ticketsService.issue({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(ticketsOutbox);
    const processedRows = await db.select().from(ticketsProcessedMessages);

    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].id).toBe(firstTicket.id);

    expect(outboxRows).toHaveLength(1);

    expect(await countStoredObjects()).toBe(1);

    // Both messages are claimed — the second one just found the order already ticketed.
    expect(processedRows.map((row) => row.messageId).sort()).toEqual(
      [MESSAGE_ID, OTHER_MESSAGE_ID].sort(),
    );

    // The losing delivery re-rendered and overwrote the object, so it must still match the row.
    const storedPdf = await storage.get(s3Key);
    expect(storedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(verifyTicketToken(ticketRows[0].qrToken, qrSecret)).toBe(ticketRows[0].id);
  });

  it('writes one row per seat, sharing a single pdf, and stays unique per (order, seat)', async () => {
    const twoSeatOrder: OrderResponse = {
      ...order,
      seats: [
        { seatId: SEAT_ID, bandId: BAND_ID },
        { seatId: SECOND_SEAT_ID, bandId: BAND_ID },
      ],
    };

    const stub = {
      request: async ({ routingKey }: { routingKey: string }): Promise<unknown> => {
        if (routingKey === ORDERS_MESSAGE_PATTERNS.GET) return twoSeatOrder;
        if (routingKey === SHOWS_MESSAGE_PATTERNS.DETAIL) return show;
        if (routingKey === SHOWS_MESSAGE_PATTERNS.SEAT_MAP) return seatMap;

        throw new Error(`unexpected rpc routing key: ${routingKey}`);
      },
    };

    const service = new TicketsService(
      db,
      storage,
      stub as never,
      new OutboxRepository(db, ticketsOutbox),
      new InboxRepository(ticketsProcessedMessages),
      qrSecret,
    );

    await service.issue(orderPaid);

    const ticketRows = await db.select().from(tickets);

    expect(ticketRows).toHaveLength(2);
    expect(ticketRows.map((row) => row.seatId).sort()).toEqual([SEAT_ID, SECOND_SEAT_ID].sort());

    // Distinct admissions: a party of two must not walk in on one scan.
    expect(new Set(ticketRows.map((row) => row.qrToken)).size).toBe(2);

    for (const row of ticketRows) {
      expect(verifyTicketToken(row.qrToken, qrSecret)).toBe(row.id);
      expect(row.s3Key).toBe(s3Key); // one document for the order, a page per seat
      expect(row.tier).toBe('Loge');
    }

    // One event and one object for the order, not one per seat.
    expect(await db.select().from(ticketsOutbox)).toHaveLength(1);
    expect(await countStoredObjects()).toBe(1);

    // Real UNIQUE(order_id, seat_id) in Postgres, not the fake's set: a different message about
    // the same order adds nothing.
    await service.issue({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    expect(await db.select().from(tickets)).toHaveLength(2);
    expect(await db.select().from(ticketsOutbox)).toHaveLength(1);
  });

  it('lists the buyer’s tickets and hides another user’s', async () => {
    await ticketsService.issue(orderPaid);

    const { items } = await ticketsService.list(USER_ID);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        orderId: ORDER_ID,
        showTitle: 'Radiohead Live',
        seatLabel: 'A A3',
        tier: 'Loge',
        status: 'active',
      }),
    );
    expect(items[0].pdfUrl).toBe(`/tickets/${items[0].id}/pdf`);

    const other = await ticketsService.list(OTHER_USER_ID);
    expect(other.items).toEqual([]);
  });

  // The one property a unit test genuinely cannot prove: that MinIO accepts our SigV4 signature.
  it('mints a presigned url MinIO actually serves', async () => {
    await ticketsService.issue(orderPaid);

    const [ticket] = await db.select().from(tickets);
    const { url } = await ticketsService.pdfUrl(USER_ID, ticket.id);

    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('attachment');

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('refuses to mint a url for someone else’s ticket', async () => {
    await ticketsService.issue(orderPaid);

    const [ticket] = await db.select().from(tickets);

    await expect(ticketsService.pdfUrl(OTHER_USER_ID, ticket.id)).rejects.toThrow(
      'Ticket not found',
    );
  });
});
