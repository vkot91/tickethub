import { NotFoundException } from '@nestjs/common';

import { venues } from '@tickethub/db';
import { getTestDb, seedShowGraph, type TestDb } from '@tickethub/db/testing';

import { OrganizerVenuesService } from './venues.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerVenuesService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerVenuesService(db);
});

describe('OrganizerVenuesService.getList', () => {
  it('returns every venue by name — the catalogue is shared, not owned', async () => {
    await seedShowGraph(db, { sections: [] });
    await seedShowGraph(db, { sections: [] });
    await db.insert(venues).values([
      { name: 'Zenith Hall', city: 'Berlin' },
      { name: 'Apollo', city: 'Lisbon', address: '1 Rua' },
    ]);

    const listed = await svc.getList();

    expect(listed.map((venue) => venue.name).slice(0, 1)).toEqual(['Apollo']);
    expect(listed.map((venue) => venue.name)).toEqual([...listed.map((v) => v.name)].sort());
    expect(listed).toHaveLength(4);
    expect(listed.find((venue) => venue.name === 'Apollo')).toMatchObject({
      city: 'Lisbon',
      address: '1 Rua',
    });
  });

  it('counts the seats in each hall, and zero for one with no sections yet', async () => {
    const { venue } = await seedShowGraph(db, {
      sections: [
        { name: 'A', rows: 2, seatsPerRow: 10 },
        { name: 'B', rows: 1, seatsPerRow: 4 },
      ],
    });
    const [empty] = await db.insert(venues).values({ name: 'Empty Hall' }).returning();

    const listed = await svc.getList();

    expect(listed.find((v) => v.id === venue.id)?.seatCount).toBe(24);
    expect(listed.find((v) => v.id === empty.id)?.seatCount).toBe(0);
  });
});

describe('OrganizerVenuesService.getOne', () => {
  it('throws NotFound for an unknown venue', async () => {
    await expect(svc.getOne('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the venue with no sections when nothing is built yet', async () => {
    const [empty] = await db.insert(venues).values({ name: 'Empty Hall' }).returning();

    const detail = await svc.getOne(empty.id);

    expect(detail.venue).toMatchObject({ id: empty.id, name: 'Empty Hall' });
    expect(detail.sections).toEqual([]);
  });

  it('groups sections, rows and seats in order', async () => {
    const { venue, sections } = await seedShowGraph(db, {
      sections: [
        { name: 'Orchestra', rows: 2, seatsPerRow: 3 },
        { name: 'Balcony', rows: 1, seatsPerRow: 2 },
      ],
    });

    const detail = await svc.getOne(venue.id);

    expect(detail.sections.map((section) => section.name)).toEqual(['Balcony', 'Orchestra']);

    const orchestra = detail.sections[1];
    expect(orchestra.rows.map((row) => row.number)).toEqual([1, 2]);
    expect(orchestra.rows[0].seats.map((seat) => seat.number)).toEqual([1, 2, 3]);
    // Ids are the ones orders and tickets reference by value — they must be the real rows.
    expect(orchestra.rows[0].seats[0].id).toBe(sections[0].rows[0].seats[0].id);
  });

  // A hall's furniture is the same whichever show is on: no pricing table joins in, so a section
  // no show has put on sale still appears in the editor.
  it('includes sections no show sells', async () => {
    const { venue } = await seedShowGraph(db, {
      sections: [{ name: 'Unsold', rows: 1, seatsPerRow: 1 }],
      priceBand: false,
    });

    const detail = await svc.getOne(venue.id);

    expect(detail.sections.map((section) => section.name)).toEqual(['Unsold']);
  });
});
