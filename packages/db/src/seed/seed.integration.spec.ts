import { createDb } from '../client';
import { requireDatabaseUrl } from '../env';
import { seed } from './index';
import { events, users } from '../schema';

describe('seed (integration, idempotent)', () => {
  const db = createDb(requireDatabaseUrl());

  it('is a no-op on the second run (stable row counts)', async () => {
    await seed(db);
    const usersAfter1 = (await db.select().from(users)).length;
    const eventsAfter1 = (await db.select().from(events)).length;
    await seed(db);
    expect((await db.select().from(users)).length).toBe(usersAfter1);
    expect((await db.select().from(events)).length).toBe(eventsAfter1);
  });

  it('seeds a single-seat flash-sale event and is idempotent', async () => {
    const first = await seed(db);
    const second = await seed(db);
    expect(first.flashSeatId).toBe(second.flashSeatId);
    expect(first.flashEventId).toBeDefined();
    expect(first.flashTicketTypeId).toBeDefined();
  });
});
