import { tickets } from '@tickethub/db';
import { getTestDb, type TestDb } from '@tickethub/db/testing';

import { displayCode, signTicketToken } from '../qr';
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

let seq = 0;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerCheckInService(db, QR_SECRET);

  // The db is truncated per test, so the seat labels may as well start from A1 in each one.
  seq = 0;
});

/** The qr token a scanner holds, and the id the printed display code is derived from.
 *  `id` is passed in only when a spec needs two tickets to share a display code. */
async function seedTicket(
  showId: string,
  checkedInAt: Date | null = null,
  id?: string,
): Promise<{ id: string; qrToken: string }> {
  // Padded into the last group: a bare counter overflows the first one past nine tickets.
  const suffix = String(++seq).padStart(12, '0');

  // The counter leads the id, so every ticket gets its own `TH-…` display code.
  id ??= `${String(seq).padStart(8, '0')}-7777-4777-8777-${suffix}`;

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

  return { id, qrToken };
}

/** The QR path, which most specs here exercise. */
async function seedToken(showId: string, checkedInAt: Date | null = null): Promise<string> {
  return (await seedTicket(showId, checkedInAt)).qrToken;
}

describe('OrganizerCheckInService.checkIn', () => {
  it('admits an unscanned ticket for the gate being scanned', async () => {
    const code = await seedToken(TONIGHT);

    const scan = await svc.checkIn(code, TONIGHT);

    expect(scan.result).toBe('valid');
    expect(scan.seatLabel).toBe('Parterre A1');
    expect(scan.checkedInAt).not.toBeNull();
    expect(scan.checkedInCount).toBe(1);
  });

  it('reports `used` on the second scan, with the original timestamp', async () => {
    const code = await seedToken(TONIGHT);

    const first = await svc.checkIn(code, TONIGHT);
    const second = await svc.checkIn(code, TONIGHT);

    expect(second.result).toBe('used');
    // The whole point: `used` must not restamp the row, so the attendant sees when it went through.
    expect(second.checkedInAt).toBe(first.checkedInAt);
    expect(second.checkedInCount).toBe(1);
  });

  // The reason `showId` is singular: without per-show scoping this would admit a ticket for a
  // show that has not happened yet.
  it('refuses the same organizer’s ticket for a different show', async () => {
    const code = await seedToken(NEXT_WEEK);

    const scan = await svc.checkIn(code, TONIGHT);

    expect(scan.result).toBe('wrongShow');

    const [row] = await db.select().from(tickets);
    expect(row.checkedInAt).toBeNull();
  });

  it('refuses another organizer’s ticket the same way', async () => {
    const code = await seedToken(RIVAL);

    const scan = await svc.checkIn(code, TONIGHT);

    // Identical to the wrong-own-show case: nothing distinguishes whose show it was.
    expect(scan.result).toBe('wrongShow');
    expect(scan.seatLabel).toBeNull();
    expect(scan.checkedInAt).toBeNull();
  });

  it('leaves a wrong-show ticket unscanned', async () => {
    const code = await seedToken(RIVAL);

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
    const code = await seedToken(TONIGHT);
    const update = jest.spyOn(db, 'update');

    const scan = await svc.checkIn(`${code}tampered`, TONIGHT);

    expect(scan.result).toBe('invalid');
    expect(update).not.toHaveBeenCalled();

    update.mockRestore();
  });

  // The fallback for a camera that will not read: the code printed on the ticket, typed by hand.
  // It is not a credential — it carries no signature — so it is only ever *resolved* to a real
  // token, always within the one show the attendant is standing at.
  describe('the printed display code', () => {
    it('admits a ticket typed in by its printed code', async () => {
      const ticket = await seedTicket(TONIGHT);

      const scan = await svc.checkIn(displayCode(ticket.id), TONIGHT);

      expect(scan.result).toBe('valid');
      expect(scan.seatLabel).toBe('Parterre A1');
      expect(scan.checkedInCount).toBe(1);
    });

    it('takes it lowercase and padded — it is read off paper and typed by a human', async () => {
      const ticket = await seedTicket(TONIGHT);

      await expect(
        svc.checkIn(` ${displayCode(ticket.id).toLowerCase()} `, TONIGHT),
      ).resolves.toMatchObject({ result: 'valid' });
    });

    it('reports `used` on a second manual entry, exactly as the QR does', async () => {
      const ticket = await seedTicket(TONIGHT);

      await svc.checkIn(displayCode(ticket.id), TONIGHT);

      await expect(svc.checkIn(displayCode(ticket.id), TONIGHT)).resolves.toMatchObject({
        result: 'used',
        checkedInCount: 1,
      });
    });

    // Scoped to the gate, so it cannot reach across shows at all. The QR's `wrongShow` needs a
    // token that resolves platform-wide; an unsigned code is never given that reach, and the
    // attendant gets `invalid` instead. The trade is deliberate.
    it('never resolves a code belonging to another show', async () => {
      const elsewhere = await seedTicket(NEXT_WEEK);

      const scan = await svc.checkIn(displayCode(elsewhere.id), TONIGHT);

      expect(scan.result).toBe('invalid');

      const [row] = await db.select().from(tickets);
      expect(row.checkedInAt).toBeNull();
    });

    // Eight hex characters are not a uniqueness guarantee. Two of them at one gate is a coin
    // flip over whose seat gets burned, so neither is admitted.
    it('refuses an ambiguous code rather than admitting an arbitrary one', async () => {
      const first = await seedTicket(TONIGHT);
      await seedTicket(TONIGHT, null, `${first.id.slice(0, 8)}-9999-4999-8999-999999999999`);

      const scan = await svc.checkIn(displayCode(first.id), TONIGHT);

      expect(scan.result).toBe('invalid');

      const rows = await db.select().from(tickets);
      expect(rows.every((row) => row.checkedInAt === null)).toBe(true);
    });

    it('reports `invalid` for a printed code no ticket carries', async () => {
      await seedTicket(TONIGHT);

      await expect(svc.checkIn('TH-DEAD-BEEF', TONIGHT)).resolves.toMatchObject({
        result: 'invalid',
      });
    });

    // The shape check is what keeps the forgery path a string comparison: anything that is
    // neither a signed token nor a `TH-…` code never reaches the database at all.
    it('does not query for a string that is neither a token nor a printed code', async () => {
      const select = jest.spyOn(db, 'select');

      await svc.checkIn('TH-NOT-A-CODE', TONIGHT);

      // Only the gate counter, which every verdict owes the scanner.
      expect(select).toHaveBeenCalledTimes(1);

      select.mockRestore();
    });
  });

  // The counter describes the gate, so it is the same number whatever the verdict — the scanner
  // screen renders "n / capacity" beside every result and must never blank it out.
  describe('the gate counter comes back with every result', () => {
    beforeEach(async () => {
      await seedToken(TONIGHT, new Date());
      await seedToken(TONIGHT, new Date());
      await seedToken(NEXT_WEEK, new Date());
    });

    it('counts only this gate, on a rejection', async () => {
      const rival = await seedToken(RIVAL);

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
      const code = await seedToken(TONIGHT);

      await expect(svc.checkIn(code, TONIGHT)).resolves.toMatchObject({
        result: 'valid',
        checkedInCount: 3,
      });
    });
  });
});

// The dashboard's number and the gate's own count read the same column of the same table.
describe('OrganizerCheckInService.checkedInCount', () => {
  it('counts only scanned tickets, only for the given shows', async () => {
    await seedTicket(TONIGHT, new Date());
    await seedTicket(TONIGHT, null);
    await seedTicket(NEXT_WEEK, new Date());

    await expect(svc.checkedInCount([TONIGHT])).resolves.toBe(1);
  });

  it('returns zero for an empty showIds', async () => {
    await seedTicket(TONIGHT, new Date());

    await expect(svc.checkedInCount([])).resolves.toBe(0);
  });
});
