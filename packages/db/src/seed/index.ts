import { and, eq } from 'drizzle-orm';

import { createDb, type Db } from '../client';
import { requireDatabaseUrl } from '../env';
import {
  orders,
  organizers,
  rows,
  seatReservations,
  seats,
  sections,
  shows,
  showSectionPricing,
  ticketTypes,
  users,
  venues,
} from '../schema';

// bcrypt hash of "password123" — regenerated with real bcrypt (Task 9 setup).
const PW_HASH = '$2b$10$7zJ/BFOmvCksYTw8T67EMeOhM5D9xz9EhVW9AoUT.YfenRwBk1mMa';

interface SectionSpec {
  name: string;
  rows: number;
  seatsPerRow: number;
}

interface VenueSpec {
  name: string;
  address: string;
  city: string;
  sections: SectionSpec[];
}

interface ShowSpec {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  status: 'draft' | 'published' | 'cancelled' | 'finished';
  /** `sections` names every venue section this type prices — one band may cover several, and a
   *  section named by no type is not on sale for this show. */
  ticketTypes: {
    name: string;
    tier: 'vip' | 'standard' | 'economy';
    priceCents: number;
    sections: string[];
  }[];
  /** Sell one pair of seats out of every N — 0 leaves the whole map free. */
  soldEveryNthPair?: number;
}

// The venue catalogue, curated by hand. Venues belong to nobody: any organizer books any hall,
// so this list is shared demo furniture, not one organizer's property. Add a hall here until
// something owns the write path.
const VENUES: VenueSpec[] = [
  {
    name: 'Demo Arena',
    address: '1 Demo St',
    city: 'Kyiv',
    sections: [
      { name: 'Parterre', rows: 2, seatsPerRow: 5 },
      { name: 'Loge', rows: 4, seatsPerRow: 10 },
      { name: 'Balcony', rows: 6, seatsPerRow: 14 },
    ],
  },
  {
    name: 'Grand Hall',
    address: '12 Symphony Ave',
    city: 'Lviv',
    sections: [
      { name: 'Orchestra', rows: 14, seatsPerRow: 26 },
      { name: 'Mezzanine', rows: 10, seatsPerRow: 22 },
      { name: 'Balcony', rows: 8, seatsPerRow: 18 },
    ],
  },
  {
    name: 'Warehouse 9',
    address: '9 Dock Rd',
    city: 'Odesa',
    sections: [
      { name: 'Floor', rows: 10, seatsPerRow: 20 },
      { name: 'Box', rows: 4, seatsPerRow: 8 },
    ],
  },
  {
    name: 'Riverside Amphitheatre',
    address: '4 River Bank',
    city: 'Dnipro',
    sections: [
      { name: 'Lower Bowl', rows: 12, seatsPerRow: 24 },
      { name: 'Upper Bowl', rows: 10, seatsPerRow: 24 },
    ],
  },
];

const SHOWS: ShowSpec[] = [
  {
    title: 'Demo Concert (seated)',
    description: 'Seated demo',
    venue: 'Demo Arena',
    startsAt: '2026-12-01T19:00:00Z',
    status: 'published',
    ticketTypes: [
      { name: 'Loge', tier: 'vip', priceCents: 8500, sections: ['Loge'] },
      { name: 'Standard', tier: 'standard', priceCents: 5000, sections: ['Parterre'] },
      { name: 'Balcony', tier: 'economy', priceCents: 3500, sections: ['Balcony'] },
    ],
    soldEveryNthPair: 4,
  },
  {
    // One band across the whole building — the demo case for a ticket type shared by several
    // sections, which is what the show_section_pricing mapping buys us.
    title: 'Demo Festival (flat price)',
    description: 'One price, every section',
    venue: 'Demo Arena',
    startsAt: '2026-12-15T18:00:00Z',
    status: 'published',
    ticketTypes: [
      {
        name: 'Standing',
        tier: 'standard',
        priceCents: 3000,
        sections: ['Parterre', 'Loge', 'Balcony'],
      },
    ],
  },
  {
    title: 'Symphony No. 9',
    description: 'The full orchestra, chorus and four soloists. One night only.',
    venue: 'Grand Hall',
    startsAt: '2026-09-18T19:30:00Z',
    status: 'published',
    ticketTypes: [
      { name: 'VIP', tier: 'vip', priceCents: 18000, sections: ['Orchestra'] },
      { name: 'Standard', tier: 'standard', priceCents: 9000, sections: ['Mezzanine'] },
      { name: 'Balcony', tier: 'economy', priceCents: 5500, sections: ['Balcony'] },
    ],
    soldEveryNthPair: 3,
  },
  {
    title: 'Nightfall: Live in Concert',
    description: 'Arena tour finale. Expect the encore to run long.',
    venue: 'Grand Hall',
    startsAt: '2026-10-04T20:00:00Z',
    status: 'published',
    ticketTypes: [
      { name: 'VIP', tier: 'vip', priceCents: 22000, sections: ['Orchestra'] },
      { name: 'Standard', tier: 'standard', priceCents: 11000, sections: ['Mezzanine', 'Balcony'] },
    ],
    // Half gone — the demo case for a densely booked map.
    soldEveryNthPair: 2,
  },
  {
    title: 'Neon Nights',
    description: 'Six DJs, two rooms, doors at 22:00.',
    venue: 'Warehouse 9',
    startsAt: '2026-08-22T22:00:00Z',
    status: 'published',
    ticketTypes: [
      { name: 'Box', tier: 'vip', priceCents: 12000, sections: ['Box'] },
      { name: 'Floor', tier: 'economy', priceCents: 4000, sections: ['Floor'] },
    ],
    soldEveryNthPair: 5,
  },
  {
    title: 'Stand-Up Marathon',
    description: 'Twelve comics, four hours, no interval. Line-up still being confirmed.',
    venue: 'Warehouse 9',
    startsAt: '2026-11-08T19:00:00Z',
    status: 'draft',
    ticketTypes: [
      { name: 'Standard', tier: 'standard', priceCents: 4500, sections: ['Floor', 'Box'] },
    ],
  },
  {
    title: 'Summer Sessions',
    description: 'Open-air, all day, rain or shine.',
    venue: 'Riverside Amphitheatre',
    startsAt: '2026-07-11T14:00:00Z',
    status: 'published',
    // "Early Bird" used to sit here naming no section, so it advertised a price no seat could be
    // bought at. Dropped rather than mapped — a band that prices nothing is a bug in the demo.
    ticketTypes: [
      { name: 'VIP', tier: 'vip', priceCents: 15000, sections: ['Lower Bowl'] },
      { name: 'Standard', tier: 'standard', priceCents: 6000, sections: ['Upper Bowl'] },
    ],
    soldEveryNthPair: 6,
  },
  {
    title: 'Rained Out Festival',
    description: 'Cancelled — refunds already issued.',
    venue: 'Riverside Amphitheatre',
    startsAt: '2026-06-20T16:00:00Z',
    status: 'cancelled',
    ticketTypes: [
      {
        name: 'Standard',
        tier: 'standard',
        priceCents: 5500,
        sections: ['Lower Bowl', 'Upper Bowl'],
      },
    ],
  },
];

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Stable fake buyers for the sold seats, so re-seeding a wiped db reproduces the same orders. */
const buyerId = (index: number): string =>
  `0000${String(index % 10000).padStart(4, '0')}-0000-4000-8000-000000000000`;

async function ensureVenue(db: Db, spec: VenueSpec): Promise<string> {
  const [existing] = await db.select().from(venues).where(eq(venues.name, spec.name));

  const venue =
    existing ??
    (
      await db
        .insert(venues)
        .values({ name: spec.name, address: spec.address, city: spec.city })
        .returning()
    )[0];

  for (const sectionSpec of spec.sections) {
    const [existingSection] = await db
      .select()
      .from(sections)
      .where(and(eq(sections.venueId, venue.id), eq(sections.name, sectionSpec.name)));

    if (existingSection) continue;

    const [section] = await db
      .insert(sections)
      .values({ venueId: venue.id, name: sectionSpec.name })
      .returning();

    const rowRecords = await db
      .insert(rows)
      .values(range(sectionSpec.rows).map((number) => ({ sectionId: section.id, number })))
      .returning();

    await db
      .insert(seats)
      .values(
        rowRecords.flatMap((row) =>
          range(sectionSpec.seatsPerRow).map((number) => ({ rowId: row.id, number })),
        ),
      );
  }

  return venue.id;
}

async function ensureShow(
  db: Db,
  organizerId: string,
  venueId: string,
  spec: ShowSpec,
): Promise<string> {
  const [inserted] = await db
    .insert(shows)
    .values({
      organizerId,
      venueId,
      title: spec.title,
      description: spec.description,
      startsAt: new Date(spec.startsAt),
      status: spec.status,
    })
    .onConflictDoNothing()
    .returning();

  // Re-select by the same key the UNIQUE now uses. Title alone would pick the wrong row — and
  // silently — the day the same title runs in a second venue or a second slot.
  const show =
    inserted ??
    (
      await db
        .select()
        .from(shows)
        .where(
          and(
            eq(shows.venueId, venueId),
            eq(shows.title, spec.title),
            eq(shows.startsAt, new Date(spec.startsAt)),
          ),
        )
    )[0];

  const venueSections = await db.select().from(sections).where(eq(sections.venueId, venueId));
  const sectionIdByName = new Map(venueSections.map((s) => [s.name, s.id]));

  const existingTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.showId, show.id));

  const existingIdByName = new Map(existingTypes.map((type) => [type.name, type.id]));

  // Upserted by name rather than skipped wholesale, so re-seeding an existing db picks up a
  // changed price or band instead of leaving stale rows in place. The id is stable, which
  // matters — orders reference it.
  for (const { sections: sectionNames, ...type } of spec.ticketTypes) {
    const values = { ...type, showId: show.id };

    const existingId = existingIdByName.get(type.name);

    let ticketTypeId = existingId;

    if (ticketTypeId) {
      await db.update(ticketTypes).set(values).where(eq(ticketTypes.id, ticketTypeId));
    } else {
      const [inserted] = await db
        .insert(ticketTypes)
        .values(values)
        .returning({ id: ticketTypes.id });
      ticketTypeId = inserted.id;
    }

    // The PK is (show, section), so re-seeding a section onto a different band has to be an
    // upsert on that key rather than an insert.
    await db
      .insert(showSectionPricing)
      .values(
        sectionNames.map((name) => ({
          showId: show.id,
          sectionId: sectionIdByName.get(name) as string,
          venueId,
          ticketTypeId,
        })),
      )
      .onConflictDoUpdate({
        target: [showSectionPricing.showId, showSectionPricing.sectionId],
        set: { ticketTypeId },
      });
  }

  return show.id;
}

/**
 * Marks part of a show's map as taken: paid orders with confirmed reservations, which is what
 * the oversell index and (once the endpoint exposes availability) the seat map read.
 * Each seat is priced through the ticket type covering its section, exactly as the seat-map
 * endpoint resolves it, so a seeded order's total matches what the UI quotes for those seats.
 */
async function sellSeats(
  db: Db,
  showId: string,
  venueId: string,
  demoUserId: string,
  everyNthPair: number,
): Promise<void> {
  const [alreadySold] = await db
    .select({ id: seatReservations.id })
    .from(seatReservations)
    .where(eq(seatReservations.showId, showId))
    .limit(1);

  if (alreadySold) return;

  const sold = await db
    .select({
      sectionId: showSectionPricing.sectionId,
      id: ticketTypes.id,
      priceCents: ticketTypes.priceCents,
      currency: ticketTypes.currency,
    })
    .from(showSectionPricing)
    .innerJoin(ticketTypes, eq(showSectionPricing.ticketTypeId, ticketTypes.id))
    .where(eq(showSectionPricing.showId, showId));

  if (sold.length === 0) return;

  const typeBySection = new Map(sold.map((row) => [row.sectionId, row]));

  const venueSeats = await db
    .select({ id: seats.id, sectionId: sections.id })
    .from(seats)
    .innerJoin(rows, eq(seats.rowId, rows.id))
    .innerJoin(sections, eq(rows.sectionId, sections.id))
    .where(eq(sections.venueId, venueId));

  const typeForSeat = (seat: { sectionId: string }) => typeBySection.get(seat.sectionId);

  const soldPairs: { id: string; sectionId: string }[][] = [];
  for (let pair = 0; pair * 2 + 1 < venueSeats.length; pair += everyNthPair) {
    const pairSeats = venueSeats.slice(pair * 2, pair * 2 + 2);

    // A section no ticket type covers is not on sale, so it cannot be seeded as sold either.
    if (pairSeats.every((seat) => typeForSeat(seat))) soldPairs.push(pairSeats);
  }

  if (soldPairs.length === 0) return;

  const placed = await db
    .insert(orders)
    .values(
      soldPairs.map((pairSeats, index) => ({
        // The first order of every show belongs to the demo user, so "My orders" is never empty.
        userId: index === 0 ? demoUserId : buyerId(index),
        showId,
        status: 'paid' as const,
        idempotencyKey: `seed-${showId}-${index}`,
        totalCents: pairSeats.reduce((sum, seat) => sum + (typeForSeat(seat)?.priceCents ?? 0), 0),
        currency: typeForSeat(pairSeats[0])?.currency ?? 'usd',
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      })),
    )
    .returning({ id: orders.id });

  await db.insert(seatReservations).values(
    placed.flatMap((order, index) =>
      soldPairs[index].map((seat) => ({
        orderId: order.id,
        showId,
        seatId: seat.id,
        ticketTypeId: typeForSeat(seat)!.id,
        status: 'confirmed' as const,
      })),
    ),
  );
}

export async function seed(db: Db): Promise<{
  showId: string;
  flashShowId: string;
  flashSeatId: string;
  flashTicketTypeId: string;
}> {
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
  const demoUser = (await db.select().from(users).where(eq(users.email, 'user@tickethub.dev')))[0];

  const [org] = await db
    .insert(organizers)
    .values({ userId: organizerUser.id, name: 'Demo Promotions' })
    .onConflictDoNothing()
    .returning();
  const orgRow =
    org ?? (await db.select().from(organizers).where(eq(organizers.userId, organizerUser.id)))[0];

  const venueIds = new Map<string, string>();
  for (const venueSpec of VENUES) {
    venueIds.set(venueSpec.name, await ensureVenue(db, venueSpec));
  }

  const showIds = new Map<string, string>();
  for (const showSpec of SHOWS) {
    const venueId = venueIds.get(showSpec.venue) as string;
    const showId = await ensureShow(db, orgRow.id, venueId, showSpec);
    showIds.set(showSpec.title, showId);

    if (showSpec.soldEveryNthPair) {
      await sellSeats(db, showId, venueId, demoUser.id, showSpec.soldEveryNthPair);
    }
  }

  // Flash-sale target: its own venue/section/row with exactly ONE seat, published
  // show — the contended seat for the k6 oversell test. Idempotent via select-first.
  const flashTitle = 'Flash Sale (1 seat)';
  const flashVenueId = await ensureVenue(db, {
    name: 'Flash Arena',
    address: '1 Flash St',
    city: 'Kyiv',
    sections: [{ name: 'Pit', rows: 1, seatsPerRow: 1 }],
  });

  const flashSeatRow = (
    await db
      .select({ id: seats.id })
      .from(seats)
      .innerJoin(rows, eq(seats.rowId, rows.id))
      .innerJoin(sections, eq(rows.sectionId, sections.id))
      .where(eq(sections.venueId, flashVenueId))
  )[0];

  const flashShowId = await ensureShow(db, orgRow.id, flashVenueId, {
    title: flashTitle,
    description: 'Oversell test',
    venue: 'Flash Arena',
    startsAt: '2026-12-20T20:00:00Z',
    status: 'published',
    ticketTypes: [{ name: 'Flash', tier: 'standard', priceCents: 5000, sections: ['Pit'] }],
  });

  const [flashType] = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.showId, flashShowId));

  return {
    showId: showIds.get('Demo Concert (seated)') as string,
    flashShowId,
    flashSeatId: flashSeatRow.id,
    flashTicketTypeId: flashType.id,
  };
}

if (require.main === module) {
  const db = createDb(requireDatabaseUrl());
  seed(db).then((r) => {
    console.log('seeded', r);
    process.exit(0);
  });
}
