import { tickets } from '@tickethub/db';
import { getTestDb, type TestDb } from '@tickethub/db/testing';
import { OrganizerStatsService } from './stats.service';

let db: TestDb;
let svc: OrganizerStatsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerStatsService(db);
});

const SHOW_A = '11111111-1111-4111-8111-111111111111';
const SHOW_B = '22222222-2222-4222-8222-222222222222';

let seq = 0;

const seedTicket = (showId: string, checkedInAt: Date | null) =>
  db.insert(tickets).values({
    orderId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
    showId,
    seatId: `5555555${++seq}-5555-4555-8555-555555555555`,
    seatLabel: `A${seq}`,
    tier: 'standard',
    qrToken: `token-${seq}`,
    s3Key: 'tickets/x.pdf',
    checkedInAt,
  });

describe('OrganizerStatsService.checkedInCount', () => {
  it('counts only scanned tickets, only for the given shows', async () => {
    await seedTicket(SHOW_A, new Date());
    await seedTicket(SHOW_A, null);
    await seedTicket(SHOW_B, new Date());

    await expect(svc.checkedInCount([SHOW_A])).resolves.toBe(1);
  });

  it('returns zero for an empty showIds', async () => {
    await seedTicket(SHOW_A, new Date());

    await expect(svc.checkedInCount([])).resolves.toBe(0);
  });
});
