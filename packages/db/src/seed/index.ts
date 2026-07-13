import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { createDb } from '../client';
import { requireDatabaseUrl } from '../env';
import { users, organizers, venues, sections, rows, seats, events, ticketTypes } from '../schema';

// bcrypt hash of "password123" — regenerated with real bcrypt (Task 9 setup).
const PW_HASH = '$2b$10$7zJ/BFOmvCksYTw8T67EMeOhM5D9xz9EhVW9AoUT.YfenRwBk1mMa';

export async function seed(db: Db): Promise<{ eventId: string; gaEventId: string }> {
  await db
    .insert(users)
    .values([
      { email: 'admin@tickethub.dev', passwordHash: PW_HASH, role: 'admin' },
      { email: 'organizer@tickethub.dev', passwordHash: PW_HASH, role: 'organizer' },
      { email: 'user@tickethub.dev', passwordHash: PW_HASH, role: 'user' },
    ])
    .onConflictDoNothing({ target: users.email })
    .returning();

  const organizerUser = (
    await db.select().from(users).where(eq(users.email, 'organizer@tickethub.dev'))
  )[0];

  const [org] = await db
    .insert(organizers)
    .values({ userId: organizerUser.id, name: 'Demo Promotions' })
    .onConflictDoNothing()
    .returning();
  const orgRow =
    org ?? (await db.select().from(organizers).where(eq(organizers.userId, organizerUser.id)))[0];

  const existingVenues = await db.select().from(venues).where(eq(venues.organizerId, orgRow.id));
  const venueRow =
    existingVenues[0] ??
    (
      await db
        .insert(venues)
        .values({ organizerId: orgRow.id, name: 'Demo Arena', address: '1 Demo St', city: 'Kyiv' })
        .returning()
    )[0];

  const existingSections = await db
    .select()
    .from(sections)
    .where(eq(sections.venueId, venueRow.id));
  if (existingSections.length === 0) {
    const [section] = await db
      .insert(sections)
      .values({ venueId: venueRow.id, name: 'Parterre' })
      .returning();
    for (let r = 1; r <= 2; r++) {
      const [row] = await db.insert(rows).values({ sectionId: section.id, number: r }).returning();
      for (let s = 1; s <= 5; s++) {
        await db.insert(seats).values({ rowId: row.id, number: s });
      }
    }
  }

  const seatedTitle = 'Demo Concert (seated)';
  const gaTitle = 'Demo Festival (GA)';
  const [seated] = await db
    .insert(events)
    .values({
      organizerId: orgRow.id,
      venueId: venueRow.id,
      title: seatedTitle,
      description: 'Seated demo',
      startsAt: new Date('2026-12-01T19:00:00Z'),
      status: 'published',
    })
    .onConflictDoNothing()
    .returning();
  const seatedRow =
    seated ?? (await db.select().from(events).where(eq(events.title, seatedTitle)))[0];

  const [ga] = await db
    .insert(events)
    .values({
      organizerId: orgRow.id,
      venueId: venueRow.id,
      title: gaTitle,
      description: 'GA demo',
      startsAt: new Date('2026-12-15T18:00:00Z'),
      status: 'published',
    })
    .onConflictDoNothing()
    .returning();
  const gaRow = ga ?? (await db.select().from(events).where(eq(events.title, gaTitle)))[0];

  const existingTypes = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, seatedRow.id));
  if (existingTypes.length === 0) {
    await db
      .insert(ticketTypes)
      .values({ eventId: seatedRow.id, name: 'Standard', priceCents: 5000 });
    await db
      .insert(ticketTypes)
      .values({ eventId: gaRow.id, name: 'GA', priceCents: 3000, quota: 50 });
  }

  return { eventId: seatedRow.id, gaEventId: gaRow.id };
}

if (require.main === module) {
  const db = createDb(requireDatabaseUrl());
  seed(db).then((r) => {
    console.log('seeded', r);
    process.exit(0);
  });
}
