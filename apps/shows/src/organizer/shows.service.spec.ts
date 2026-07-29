import { getTestDb, seedShowGraph, seedUser, type TestDb } from '@tickethub/db/testing';
import { OrganizerShowsService } from './shows.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerShowsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerShowsService(db);
});

describe('OrganizerShowsService.showIds', () => {
  it('returns only the calling organizer’s shows, whatever their status', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      sections: [],
      show: { status: 'draft' },
    });
    await seedShowGraph(db, { sections: [] }); // someone else's

    await expect(svc.showIds(organizer.userId)).resolves.toEqual([show.id]);
  });

  it('returns an empty list for a user who is not an organizer', async () => {
    const user = await seedUser(db);

    await expect(svc.showIds(user.id)).resolves.toEqual([]);
  });
});
