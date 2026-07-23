import { S3Client as AwsS3, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { loadEnv, requireEnv } from '@tickethub/env';
import { sql } from 'drizzle-orm';
import {
  createDb,
  tickets,
  fulfillmentOutbox,
  fulfillmentProcessedMessages,
  type Db,
} from '@tickethub/db';
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
import { verifyTicketToken } from './pdf/qr';
import { S3Client } from './storage/s3.client';
import { TicketsService } from './tickets/tickets.service';

jest.setTimeout(30_000);

const ORDER_ID = '11111111-1111-4111-8111-1111110000aa';
const USER_ID = '22222222-2222-4222-8222-2222220000aa';
const SHOW_ID = '33333333-3333-4333-8333-3333330000aa';
const MESSAGE_ID = '44444444-4444-4444-8444-4444440000aa';
const REDELIVERED_MESSAGE_ID = MESSAGE_ID;
const OTHER_MESSAGE_ID = '55555555-5555-4555-8555-5555550000aa';
const SEAT_ID = '66666666-6666-4666-8666-6666660000aa';
const TICKET_TYPE_ID = '77777777-7777-4777-8777-7777770000aa';

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
  seats: [{ seatId: SEAT_ID, ticketTypeId: TICKET_TYPE_ID }],
};

const show: ShowDetail = {
  id: SHOW_ID,
  title: 'Radiohead Live',
  description: 'A concert',
  startsAt: '2026-08-01T18:00:00.000Z',
  posterUrl: null,
  status: 'published',
  venueId: '88888888-8888-4888-8888-8888880000aa',
};

// The seat the order carries lives in this map, so the rendered pdf gets a human label ("A 1-3")
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
          seats: [{ id: SEAT_ID, number: 3 }],
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

describe('Fulfillment order.paid idempotency (integration: real Postgres + real MinIO)', () => {
  const s3Key = `${ORDER_ID}.pdf`;

  let db: Db;
  let s3: S3Client;
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

    s3 = new S3Client({ endpoint, accessKey, secretKey, bucket });

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
      sql`truncate ${tickets}, ${sql.raw('"fulfillment"."outbox"')}, ${sql.raw('"fulfillment"."processed_messages"')} restart identity cascade`,
    );

    await rawS3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));

    amqpStub = makeAmqpStub();

    ticketsService = new TicketsService(
      db,
      s3,
      amqpStub as never,
      new OutboxRepository(db, fulfillmentOutbox),
      new InboxRepository(fulfillmentProcessedMessages),
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
    await ticketsService.handleOrderPaid(orderPaid);

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(fulfillmentOutbox);

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
    const storedPdf = await s3.get(s3Key);
    expect(storedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(storedPdf.length).toBeGreaterThan(1000);

    expect(amqpStub.requestedRoutingKeys).toEqual([
      ORDERS_MESSAGE_PATTERNS.GET,
      SHOWS_MESSAGE_PATTERNS.DETAIL,
      SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
    ]);
  });

  it('adds nothing on a duplicate delivery of the same message', async () => {
    await ticketsService.handleOrderPaid(orderPaid);

    const [firstTicket] = await db.select().from(tickets);
    const pdfAfterFirstDelivery = await s3.get(s3Key);

    await ticketsService.handleOrderPaid({ ...orderPaid, messageId: REDELIVERED_MESSAGE_ID });

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(fulfillmentOutbox);

    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].id).toBe(firstTicket.id);
    expect(ticketRows[0].qrToken).toBe(firstTicket.qrToken);

    expect(outboxRows).toHaveLength(1);

    expect(await countStoredObjects()).toBe(1);
    expect(await s3.get(s3Key)).toEqual(pdfAfterFirstDelivery);

    // The redelivery short-circuited on the committed claim, so it never even asked orders.
    expect(amqpStub.requestedRoutingKeys).toEqual([
      ORDERS_MESSAGE_PATTERNS.GET,
      SHOWS_MESSAGE_PATTERNS.DETAIL,
      SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
    ]);
  });

  it('adds no second ticket or outbox row for a different message about the same order', async () => {
    await ticketsService.handleOrderPaid(orderPaid);

    const [firstTicket] = await db.select().from(tickets);

    await ticketsService.handleOrderPaid({ ...orderPaid, messageId: OTHER_MESSAGE_ID });

    const ticketRows = await db.select().from(tickets);
    const outboxRows = await db.select().from(fulfillmentOutbox);
    const processedRows = await db.select().from(fulfillmentProcessedMessages);

    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0].id).toBe(firstTicket.id);

    expect(outboxRows).toHaveLength(1);

    expect(await countStoredObjects()).toBe(1);

    // Both messages are claimed — the second one just found the order already ticketed.
    expect(processedRows.map((row) => row.messageId).sort()).toEqual(
      [MESSAGE_ID, OTHER_MESSAGE_ID].sort(),
    );

    // The losing delivery re-rendered and overwrote the object, so it must still match the row.
    const storedPdf = await s3.get(s3Key);
    expect(storedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(verifyTicketToken(ticketRows[0].qrToken, qrSecret)).toBe(ticketRows[0].id);
  });
});
