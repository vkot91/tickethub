import { eq } from 'drizzle-orm';

import { organizers } from '@tickethub/db';
import { getTestDb, seedUser, type TestDb } from '@tickethub/db/testing';

import { OrganizerProfileService } from './profile.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerProfileService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerProfileService(db);
});

describe('OrganizerProfileService.create', () => {
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
