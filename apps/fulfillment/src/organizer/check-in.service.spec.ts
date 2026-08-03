import { tickets } from '@tickethub/db';
import { getTestDb, type TestDb } from '@tickethub/db/testing';

import { signTicketToken } from '../tickets/qr';
import { OrganizerCheckInService } from './check-in.service';

const QR_SECRET = 'test-qr-secret';

/** The gate being scanned. */
const TONIGHT = '11111111-1111-4111-8111-111111111111';
/** The same organizer's other show — the case per-show scoping exists for. */
const NEXT_WEEK = '22222222-2222-4222-8222-222222222222';
/** Someone else's show entirely. */
const RIVAL = '33333333-3333-4333-8333-333333333333';

let db: TestDb;
let svc: OrganizerCheckInService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerCheckInService(db, QR_SECRET);
});

let seq = 0;

/** Returns the ticket's qr token — what a scanner actually holds. */
async function seedTicket(showId: string, checkedInAt: Date | null = null): Promise<string> {
  // Padded into the last group: a bare counter overflows the first one past nine tickets.
  const suffix = String(++seq).padStart(12, '0');
  const id = `77777777-7777-4777-8777-${suffix}`;
  const qrToken = signTicketToken(id, QR_SECRET);

  await db.insert(tickets).values({
    id,
    orderId: '44444444-4444-4444-8444-444444444444',
    userId: '55555555-5555-4555-8555-555555555555',
    showId,
    seatId: `66666666-6666-4666-8666-${suffix}`,
    seatLabel: `Parterre A${seq}`,
    tier: 'standard',
    qrToken,
    s3Key: 'tickets/x.pdf',
    checkedInAt,
  });

  return qrToken;
}

describe('OrganizerCheckInService.checkIn', () => {
  it('admits an unscanned ticket for the gate being scanned', async () => {
    const code = await seedTicket(TONIGHT);

    const scan = await svc.checkIn(code, TONIGHT);

    expect(scan.result).toBe('valid');
    expect(scan.seatLabel).toBe('Parterre A1');
    expect(scan.checkedInAt).not.toBeNull();
    expect(scan.checkedInCount).toBe(1);
  });

  it('reports `used` on the second scan, with the original timestamp', async () => {
    const code = await seedTicket(TONIGHT);

    const first = await svc.checkIn(code, TONIGHT);
    const second = await svc.checkIn(code, TONIGHT);

    expect(second.result).toBe('used');
    // The whole point: `used` must not restamp the row, so the attendant sees when it went through.
    expect(second.checkedInAt).toBe(first.checkedInAt);
    expect(second.checkedInCount).toBe(1);
  });

  // The reason `showId` is singular. Before per-show scoping this returned `valid` and burned a
  // ticket for a show that had not happened yet.
  it('refuses the same organizer’s ticket for a different show', async () => {
    const code = await seedTicket(NEXT_WEEK);

    const scan = await svc.checkIn(code, TONIGHT);

    expect(scan.result).toBe('wrongShow');

    const [row] = await db.select().from(tickets);
    expect(row.checkedInAt).toBeNull();
  });

  it('refuses another organizer’s ticket the same way', async () => {
    const code = await seedTicket(RIVAL);

    const scan = await svc.checkIn(code, TONIGHT);

    // Identical to the wrong-own-show case: nothing distinguishes whose show it was.
    expect(scan.result).toBe('wrongShow');
    expect(scan.seatLabel).toBeNull();
    expect(scan.checkedInAt).toBeNull();
  });

  it('leaves a wrong-show ticket unscanned', async () => {
    const code = await seedTicket(RIVAL);

    await svc.checkIn(code, TONIGHT);

    const [row] = await db.select().from(tickets);
    expect(row.checkedInAt).toBeNull();
  });

  it('reports `invalid` for a well-signed code no ticket carries', async () => {
    const scan = await svc.checkIn(
      signTicketToken('88888888-8888-4888-8888-888888888888', QR_SECRET),
      TONIGHT,
    );

    expect(scan.result).toBe('invalid');
    expect(scan.seatLabel).toBeNull();
  });

  // The HMAC check runs first, so a forgery never reaches the ticket lookup — it cannot admit a
  // seat, and it costs a string comparison instead of a query. (It still reads the gate's counter;
  // that number is owed to the scanner whatever the verdict.)
  it('rejects a forged signature without attempting an admission', async () => {
    const code = await seedTicket(TONIGHT);
    const update = jest.spyOn(db, 'update');

    const scan = await svc.checkIn(`${code}tampered`, TONIGHT);

    expect(scan.result).toBe('invalid');
    expect(update).not.toHaveBeenCalled();

    update.mockRestore();
  });

  // The counter describes the gate, so it is the same number whatever the verdict — the scanner
  // screen renders "n / capacity" beside every result and must never blank it out.
  describe('the gate counter comes back with every result', () => {
    beforeEach(async () => {
      await seedTicket(TONIGHT, new Date());
      await seedTicket(TONIGHT, new Date());
      await seedTicket(NEXT_WEEK, new Date());
    });

    it('counts only this gate, on a rejection', async () => {
      const rival = await seedTicket(RIVAL);

      await expect(svc.checkIn(rival, TONIGHT)).resolves.toMatchObject({
        result: 'wrongShow',
        checkedInCount: 2,
      });
    });

    it('counts only this gate, on an invalid code', async () => {
      const scan = await svc.checkIn(
        signTicketToken('99999999-9999-4999-8999-999999999999', QR_SECRET),
        TONIGHT,
      );

      expect(scan).toMatchObject({ result: 'invalid', checkedInCount: 2 });
    });

    it('counts this gate even for a forged code', async () => {
      await expect(svc.checkIn('not-a-token', TONIGHT)).resolves.toMatchObject({
        result: 'invalid',
        checkedInCount: 2,
      });
    });

    it('includes the seat it just admitted', async () => {
      const code = await seedTicket(TONIGHT);

      await expect(svc.checkIn(code, TONIGHT)).resolves.toMatchObject({
        result: 'valid',
        checkedInCount: 3,
      });
    });
  });
});
