import { sql } from 'drizzle-orm';

import { createDb, tickets, type Db } from '@tickethub/db';
import { loadEnv, requireEnv } from '@tickethub/env';

import { signTicketToken } from '../tickets/qr';
import { OrganizerCheckInService } from './check-in.service';

jest.setTimeout(30_000);

const SHOW_ID = '33333333-3333-4333-8333-3333330000cc';
const TICKET_ID = '77777777-7777-4777-8777-7777770000cc';
const SEAT_ID = '66666666-6666-4666-8666-6666660000cc';

// Two attendants scanning the same wristband at two turnstiles, at the same instant. pglite is
// single-connection, so this can only be proved against real Postgres — the whole reason the
// service uses one conditional UPDATE and not a read-then-write.
describe('Check-in concurrency (integration: real Postgres)', () => {
  let db: Db;
  let code: string;
  let svc: OrganizerCheckInService;

  beforeAll(() => {
    loadEnv();

    db = createDb(requireEnv('DATABASE_URL'));

    const qrSecret = requireEnv('TICKET_QR_SECRET');

    code = signTicketToken(TICKET_ID, qrSecret);
    svc = new OrganizerCheckInService(db, qrSecret);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate ${tickets} restart identity cascade`);

    await db.insert(tickets).values({
      id: TICKET_ID,
      orderId: '11111111-1111-4111-8111-1111110000cc',
      userId: '22222222-2222-4222-8222-2222220000cc',
      showId: SHOW_ID,
      seatId: SEAT_ID,
      seatLabel: 'Parterre A2',
      tier: 'standard',
      qrToken: code,
      s3Key: 'tickets/x.pdf',
    });
  });

  it('admits one seat exactly once across two simultaneous scans', async () => {
    const scans = await Promise.all([svc.checkIn(code, SHOW_ID), svc.checkIn(code, SHOW_ID)]);

    const results = scans.map((scan) => scan.result).sort();

    expect(results).toEqual(['used', 'valid']);

    // And the gate counter agrees: one seat through, not two.
    const [counted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(sql`${tickets.checkedInAt} is not null`);

    expect(counted.count).toBe(1);
  });
});
