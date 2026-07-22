import { NotFoundException } from '@nestjs/common';
import { getTestDb, seedShowGraph, type TestDb } from '@tickethub/db/testing';
import { ShowsService } from './shows.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: ShowsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new ShowsService(db);
});

describe('ShowsService.catalog', () => {
  it('returns items and a nextCursor when the page is full', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const { show } = await seedShowGraph(db, { sections: [] });
      ids.push(show.id);
    }
    const expectedCursor = [...ids].sort()[20]; // service orders by asc(id)

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(20);
    expect(res.nextCursor).toBe(expectedCursor);
  });

  it('returns null cursor when page is not full', async () => {
    await seedShowGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it('excludes unpublished shows', async () => {
    await seedShowGraph(db, { sections: [], show: { status: 'draft' } });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toEqual([]);
  });

  it('filters by cursor when one is given', async () => {
    const { show } = await seedShowGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20, cursor: show.id });

    expect(res.items).toEqual([]); // show's own id is not > itself
    expect(res.nextCursor).toBeNull();
  });
});

describe('ShowsService.detail', () => {
  it('returns the show when found', async () => {
    const { show } = await seedShowGraph(db, { sections: [], show: { title: 'Show' } });

    const res = await svc.detail(show.id);

    expect(res.id).toBe(show.id);
    expect(res.title).toBe('Show');
  });

  it('throws NotFound when the show is missing', async () => {
    await expect(svc.detail('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ShowsService.seatMap', () => {
  it('throws NotFound when the show is missing', async () => {
    await expect(svc.seatMap('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('builds the seat map from sections, rows, and seats', async () => {
    const { show, sections } = await seedShowGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 1 }],
    });
    const seededSeat = sections[0].rows[0].seats[0];

    const map = await svc.seatMap(show.id);

    expect(map.showId).toBe(show.id);
    expect(map.sections[0].name).toBe('A');
    expect(map.sections[0].rows[0].seats[0].id).toBe(seededSeat.id);
  });
});
