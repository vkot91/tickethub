import { NotFoundException } from '@nestjs/common';
import { getTestDb, seedEventGraph, type TestDb } from '@tickethub/db/testing';
import { EventsService } from './events.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: EventsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new EventsService(db);
});

describe('EventsService.catalog', () => {
  it('returns items and a nextCursor when the page is full', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const { event } = await seedEventGraph(db, { sections: [] });
      ids.push(event.id);
    }
    const expectedCursor = [...ids].sort()[20]; // service orders by asc(id)

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(20);
    expect(res.nextCursor).toBe(expectedCursor);
  });

  it('returns null cursor when page is not full', async () => {
    await seedEventGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it('excludes unpublished events', async () => {
    await seedEventGraph(db, { sections: [], event: { status: 'draft' } });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toEqual([]);
  });

  it('filters by cursor when one is given', async () => {
    const { event } = await seedEventGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20, cursor: event.id });

    expect(res.items).toEqual([]); // event's own id is not > itself
    expect(res.nextCursor).toBeNull();
  });
});

describe('EventsService.detail', () => {
  it('returns the event when found', async () => {
    const { event } = await seedEventGraph(db, { sections: [], event: { title: 'Show' } });

    const res = await svc.detail(event.id);

    expect(res.id).toBe(event.id);
    expect(res.title).toBe('Show');
  });

  it('throws NotFound when the event is missing', async () => {
    await expect(svc.detail('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('EventsService.seatMap', () => {
  it('throws NotFound when the event is missing', async () => {
    await expect(svc.seatMap('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('builds the seat map from sections, rows, and seats', async () => {
    const { event, sections } = await seedEventGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 1 }],
    });
    const seededSeat = sections[0].rows[0].seats[0];

    const map = await svc.seatMap(event.id);

    expect(map.eventId).toBe(event.id);
    expect(map.sections[0].name).toBe('A');
    expect(map.sections[0].rows[0].seats[0].id).toBe(seededSeat.id);
  });
});
