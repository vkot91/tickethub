import type { Db } from '../client';
import { users } from '../schema/auth';
import { organizers, venues, sections, rows, seats, shows } from '../schema/shows';

// Monotonic suffix so repeated seeds in one db don't collide on unique columns
// (users.email, shows.title).
let seq = 0;
const uniq = () => ++seq;

type Insert<T> = Partial<T>;

export async function seedUser(db: Db, overrides: Insert<typeof users.$inferInsert> = {}) {
  const n = uniq();

  const [user] = await db
    .insert(users)
    .values({ email: `user${n}@test.dev`, passwordHash: 'hash', ...overrides })
    .returning();

  return user;
}

// Shape of the seated-venue graph a caller wants. Defaults to one section with
// one row of one seat — enough for seatMap/detail; bump counts per test.
export interface ShowGraphSpec {
  show?: Insert<typeof shows.$inferInsert>;
  sections?: { name?: string; rows?: number; seatsPerRow?: number }[];
}

export async function seedShowGraph(db: Db, spec: ShowGraphSpec = {}) {
  const n = uniq();

  const owner = await seedUser(db);

  const [organizer] = await db
    .insert(organizers)
    .values({ userId: owner.id, name: `Organizer ${n}` })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({ organizerId: organizer.id, name: `Venue ${n}` })
    .returning();

  const sectionSpecs = spec.sections ?? [{ rows: 1, seatsPerRow: 1 }];

  const builtSections = [];
  for (const [i, s] of sectionSpecs.entries()) {
    const [section] = await db
      .insert(sections)
      .values({ venueId: venue.id, name: s.name ?? `Section ${i + 1}` })
      .returning();

    const builtRows = [];
    for (let r = 1; r <= (s.rows ?? 1); r++) {
      const [row] = await db.insert(rows).values({ sectionId: section.id, number: r }).returning();

      const seatRows = [];
      for (let seatNo = 1; seatNo <= (s.seatsPerRow ?? 1); seatNo++) {
        const [seat] = await db.insert(seats).values({ rowId: row.id, number: seatNo }).returning();
        seatRows.push(seat);
      }

      builtRows.push({ row, seats: seatRows });
    }

    builtSections.push({ section, rows: builtRows });
  }

  const [show] = await db
    .insert(shows)
    .values({
      organizerId: organizer.id,
      venueId: venue.id,
      title: `Show ${n}`,
      startsAt: new Date(),
      status: 'published',
      ...spec.show,
    })
    .returning();

  return { show, organizer, venue, sections: builtSections };
}
