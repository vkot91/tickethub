import { eq } from 'drizzle-orm';
import { organizers } from '@tickethub/db';
import { getTestDb, seedUser, type TestDb } from '@tickethub/db/testing';
import { OrganizerService } from './organizer.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerService(db);
});

describe('OrganizerService.create', () => {
  it('creates the organizer on first call and returns the same id on the second', async () => {
    const user = await seedUser(db);

    const first = await svc.create(user.id, 'Anna');
    const second = await svc.create(user.id, 'Someone else');

    expect(second).toBe(first);
    const [row] = await db.select().from(organizers).where(eq(organizers.userId, user.id));
    expect(row.name).toBe('Anna');
  });

  it('resolves to one row when two writes race', async () => {
    const user = await seedUser(db);

    const [a, b] = await Promise.all([svc.create(user.id, 'Anna'), svc.create(user.id, 'Anna')]);

    expect(a).toBe(b);
    expect(await db.select().from(organizers).where(eq(organizers.userId, user.id))).toHaveLength(
      1,
    );
  });
});
